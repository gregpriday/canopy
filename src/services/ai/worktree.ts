import { getAIClient } from './client.js';
import { extractOutputText } from './utils.js';
import fs from 'fs-extra';
import path from 'node:path';
import simpleGit from 'simple-git';
import { withRetry } from '../../utils/errorHandling.js';
import { events } from '../events.js';
import { getUserMessage } from '../../utils/errorTypes.js';
import type { Worktree } from '../../types/index.js';

export interface WorktreeSummary {
  summary: string;
  modifiedCount: number;
}

const ERROR_SNIPPET_MAX = 400;
const MAX_WORDS = 10;

function formatErrorSnippet(raw: unknown): string {
  const asString =
    typeof raw === 'string'
      ? raw
      : (() => {
          try {
            return JSON.stringify(raw);
          } catch {
            return String(raw);
          }
        })();

  if (!asString) return '';
  return asString.length > ERROR_SNIPPET_MAX ? `${asString.slice(0, ERROR_SNIPPET_MAX)}...` : asString;
}

/**
 * Resilient JSON parser that can handle malformed JSON responses.
 * Tries standard JSON.parse first, then falls back to regex extraction.
 */
function parseResilientJSON(text: string): string | null {
  // First try: standard JSON parsing
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.summary === 'string') {
      return parsed.summary.replace(/\s+/g, ' ').trim();
    }
  } catch {
    // Fall through to regex parsing
  }

  // Second try: regex extraction
  // Match "summary": "value" or "summary":"value" with various quote styles
  const patterns = [
    /"summary"\s*:\s*"([^"]+)"/,
    /"summary"\s*:\s*'([^']+)'/,
    /'summary'\s*:\s*"([^"]+)"/,
    /'summary'\s*:\s*'([^']+)'/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, ' ').trim();
    }
  }

  // Third try: look for any quoted string after "summary" (even more lenient)
  const laxMatch = text.match(/"summary"[^"']*["']([^"']+)["']/);
  if (laxMatch?.[1]) {
    return laxMatch[1].replace(/\s+/g, ' ').trim();
  }

  return null;
}

function normalizeSummary(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  let compressed = firstLine.replace(/\s+/g, ' ').trim();
  if (!compressed) return '';

  // Ensure space after emoji before alphanumeric characters
  // Match any non-ASCII character (likely emoji) directly followed by alphanumeric
  compressed = compressed.replace(/([\u{80}-\u{10ffff}])([a-zA-Z0-9])/gu, '$1 $2');

  const words = compressed.split(' ').slice(0, MAX_WORDS);
  return words.join(' ');
}

/**
 * Generate AI summary for a worktree based on git diff and branch name.
 *
 * @param worktreePath - Absolute path to worktree
 * @param branchName - Branch name (used for context)
 * @param mainBranch - Main branch to compare against (typically 'main' or 'master')
 * @param changesForThisWorktree - Optional WorktreeChanges with file-level details for smarter prioritization
 * @returns Summary and modified file count, or null if AI client is unavailable
 */
export async function generateWorktreeSummary(
  worktreePath: string,
  branchName: string | undefined,
  mainBranch: string = 'main',
  changesForThisWorktree?: import('../../types/index.js').WorktreeChanges
): Promise<WorktreeSummary | null> {
  const git = simpleGit(worktreePath);
  let modifiedCount = 0;
  let promptContext = '';

  try {
    const status = await git.status();
    const deletedFiles = [...status.deleted];
    const createdFiles = Array.from(new Set([...status.created, ...status.not_added]));
    const modifiedFiles = Array.from(new Set(status.modified));
    const renamedFiles = status.renamed.map(r => `${r.from} -> ${r.to}`);
    const renamedTargets = status.renamed.map(r => r.to);

    modifiedCount =
      status.modified.length +
      status.created.length +
      status.deleted.length +
      status.renamed.length +
      status.not_added.length;

    // Two-stage system: if no changes, show last commit instead of AI summary
    // Note: WorktreeMonitor handles this case, but keep this for backward compatibility
    if (modifiedCount === 0) {
      try {
        const log = await git.log({ maxCount: 1 });
        const lastCommitMsg = log.latest?.message ?? '';

        if (lastCommitMsg) {
          const firstLine = lastCommitMsg.split('\n')[0].trim();
          return {
            summary: `✅ ${firstLine}`,
            modifiedCount: 0
          };
        }
      } catch (e) {
        // Git log failed - return null to let WorktreeMonitor handle it
      }

      // No commits - return null, WorktreeMonitor will handle fallback
      return null;
    }

    // --- AI GENERATION SECTION STARTS HERE ---
    // Check for AI client before attempting generation
    const client = getAIClient();
    if (!client) {
      // If we have changes but no AI, return null so UI shows "No summary available"
      return null;
    }

    // Note: We used to skip "trivial" single-file changes, but users want AI summaries
    // for ALL non-empty file changes, regardless of size. The mechanical summary
    // logic below (for truly empty diffs) still applies.

    // Expanded noise filtering
    const IGNORED_PATTERNS = [
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /\.map$/,
      /\.svg$/, /\.png$/, /\.ico$/, /\.jpg$/, /\.jpeg$/,
      /^dist\//, /^build\//, /^\.next\//,
      /\.log$/, /\.tmp$/,
      /^coverage\//, /^\.nyc_output\//,
      /__snapshots__\//, /\.snap$/,
      /^vendor\//, /^generated\//,
      /\.lock\.db$/, /\.sqlite$/
    ];

    const isHighValue = (file: string) => !IGNORED_PATTERNS.some(p => p.test(file));

    // Build scored file list from changesForThisWorktree if available
    interface ScoredFile {
      path: string;
      relPath: string;
      score: number;
      isNew: boolean;
      status: string;
      insertions: number;
      deletions: number;
      mtimeMs: number;
    }

    const scoredFiles: ScoredFile[] = [];
    const now = Date.now();

    if (changesForThisWorktree) {
      // Use detailed change data with scoring
      for (const change of changesForThisWorktree.changes) {
        const relPath = path.relative(worktreePath, change.path);
        if (!isHighValue(relPath)) continue;

        const isSrc = relPath.startsWith('src/');
        const isTest = /(__tests__|\.test\.|\.spec\.)/.test(relPath);
        const isDoc = /README|docs?\//i.test(relPath);

        const typeWeight =
          isSrc ? 1.0 :
          isTest ? 0.9 :
          isDoc ? 0.8 :
          0.7;

        const absChanges = (change.insertions ?? 0) + (change.deletions ?? 0);
        const magnitudeScore = Math.log2(1 + absChanges); // saturates

        const ageMs = change.mtimeMs ? now - change.mtimeMs : Number.MAX_SAFE_INTEGER;
        const recencyScore =
          ageMs < 5 * 60_000 ? 2.0 :      // < 5 min
          ageMs < 60 * 60_000 ? 1.0 :     // < 1 hour
          ageMs < 24 * 60 * 60_000 ? 0.5  // < 1 day
          : 0.25;

        const score = 3 * recencyScore + 2 * magnitudeScore + 1 * typeWeight;

        scoredFiles.push({
          path: change.path,
          relPath,
          score,
          isNew: change.status === 'added' || change.status === 'untracked',
          status: change.status,
          insertions: change.insertions ?? 0,
          deletions: change.deletions ?? 0,
          mtimeMs: change.mtimeMs ?? 0
        });
      }
    } else {
      // Fallback to simple git status (no detailed stats)
      const allFiles = Array.from(new Set([...createdFiles, ...modifiedFiles, ...renamedTargets]));
      for (const file of allFiles) {
        if (!isHighValue(file)) continue;
        const isSrc = file.startsWith('src/');
        const typeWeight = isSrc ? 1.0 : 0.7;
        scoredFiles.push({
          path: path.join(worktreePath, file),
          relPath: file,
          score: typeWeight,
          isNew: createdFiles.includes(file),
          status: createdFiles.includes(file) ? 'added' : 'modified',
          insertions: 0,
          deletions: 0,
          mtimeMs: 0
        });
      }
    }

    // Sort by score descending
    scoredFiles.sort((a, b) => b.score - a.score);

    // Tiered context: Tier 1 (top 3-5 files with rich diffs), Tier 2 (next 5-10 with light summaries)
    const TIER_1_COUNT = scoredFiles.length <= 3 ? scoredFiles.length : Math.min(5, scoredFiles.length);
    const TIER_2_COUNT = Math.min(10, scoredFiles.length - TIER_1_COUNT);
    const tier1Files = scoredFiles.slice(0, TIER_1_COUNT);
    const tier2Files = scoredFiles.slice(TIER_1_COUNT, TIER_1_COUNT + TIER_2_COUNT);

    // Budgets
    const META_BUDGET = 500;
    const DIFF_BUDGET = 1000;
    let metaLength = 0;
    let diffLength = 0;

    // Start with deleted files (metadata)
    if (deletedFiles.length > 0) {
      const deletedLines = deletedFiles.map(f => `deleted: ${f}`).join('\n') + '\n';
      if (metaLength + deletedLines.length <= META_BUDGET) {
        promptContext += deletedLines;
        metaLength += deletedLines.length;
      }
    }

    if (renamedFiles.length > 0) {
      const renamedLines = renamedFiles.map(r => `renamed: ${r}`).join('\n') + '\n';
      if (metaLength + renamedLines.length <= META_BUDGET) {
        promptContext += renamedLines;
        metaLength += renamedLines.length;
      }
    }

    // Tier 2: Light summaries (metadata budget)
    for (const file of tier2Files) {
      if (metaLength >= META_BUDGET) break;
      const ins = file.insertions > 0 ? `+${file.insertions}` : '';
      const del = file.deletions > 0 ? `-${file.deletions}` : '';
      const changes = ins && del ? `${ins}/${del}` : ins || del || '';
      const line = `${file.status}: ${file.relPath}${changes ? ` (${changes})` : ''}\n`;
      if (metaLength + line.length <= META_BUDGET) {
        promptContext += line;
        metaLength += line.length;
      }
    }

    // Tier 1: Rich diffs (diff budget)
    for (const file of tier1Files) {
      if (diffLength >= DIFF_BUDGET) break;

      try {
        let diff = '';

        if (file.isNew) {
          // Skeletonize new files
          const content = await fs.readFile(file.path, 'utf8');
          const lines = content.split('\n');

          const skeleton = lines
            .filter(line => /^(import|export|class|function|interface|type|const|let|var)\s/.test(line.trim()))
            .slice(0, 10)
            .join('\n');

          // For empty files (no structural content), skip - don't add to prompt
          if (!skeleton) {
            continue;
          }
          diff = `NEW FILE STRUCTURE:\n${skeleton}`;
        } else {
          // Zero-context diffs with aggressive line filtering
          diff = await git.diff([
            '--unified=0',
            '--minimal',
            '--ignore-all-space',
            '--ignore-blank-lines',
            'HEAD',
            '--',
            file.relPath
          ]);
        }

        const cleanDiff = diff
          .split('\n')
          .filter(line =>
            !line.startsWith('index ') &&
            !line.startsWith('diff --git') &&
            !line.startsWith('@@') &&              // drop hunk headers
            !/^[+-]\s*(import|from\s+['"])/.test(line) && // drop imports
            !/^[+-]\s*\/\//.test(line) &&          // drop single-line comments
            line.trim() !== '+' && line.trim() !== '-' &&
            line.trim() !== '+{' && line.trim() !== '+}' &&
            line.trim() !== '-{' && line.trim() !== '-}'
          )
          .join('\n');

        if (cleanDiff.trim()) {
          const diffBlock = `\nFile: ${file.relPath}\n${cleanDiff}\n`;
          if (diffLength + diffBlock.length <= DIFF_BUDGET) {
            promptContext += diffBlock;
            diffLength += diffBlock.length;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    // If we have changes but no diff content, create minimal context for AI
    // AI should still generate something reasonable even for empty/binary files
    if (!promptContext.trim()) {
      const fileList: string[] = [];
      if (createdFiles.length > 0) fileList.push(...createdFiles.map(f => `added: ${f}`));
      if (modifiedFiles.length > 0) fileList.push(...modifiedFiles.map(f => `modified: ${f}`));
      if (deletedFiles.length > 0) fileList.push(...deletedFiles.map(f => `deleted: ${f}`));

      promptContext = fileList.slice(0, 5).join('\n');

      // If still no context (shouldn't happen), this will be handled by AI with just file names
    }

    const callModel = async (): Promise<WorktreeSummary> => {
      const response = await client.responses.create({
        model: 'gpt-5-nano',
        instructions: `Summarize the git changes into a single active-tense sentence (max 10 words).
Pay most attention to files listed first and with diffs shown.
Ignore imports, formatting, and minor refactors.
Focus on the feature being added or the bug being fixed.
Start with an emoji.

If context is minimal (just file names or empty files), infer the likely purpose from file names and make a reasonable guess.
For example: adding empty test files → "🧪 Setting up test infrastructure"
For example: adding empty components → "🎨 Creating UI components"

Respond with JSON: {"summary":"emoji + description"}
No newlines in your response.
Examples:
{"summary":"🚧 Building dashboard filters"}
{"summary":"🔧 Optimizing CLI flag parsing"}
{"summary":"✅ Fixing auth handshake bug"}
{"summary":"🎨 Redesigning settings page"}`,
        input: promptContext,
        text: {
          format: {
            type: 'json_schema',
            name: 'worktree_summary',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                summary: {
                  type: 'string',
                  description: 'One emoji followed by up to 10 words describing the feature or bug fix, no newlines',
                  maxLength: 100
                }
              },
              required: ['summary'],
              additionalProperties: false
            }
          }
        },
        reasoning: { effort: 'minimal' },
        max_output_tokens: 128
      } as any);

      const text = extractOutputText(response);
      if (!text) {
        throw new Error(`Worktree summary: empty response from model. Raw: ${formatErrorSnippet(response)}`);
      }

      // Remove all newlines and carriage returns before parsing
      const cleanedText = text.replace(/[\r\n]+/g, '');

      const summary = parseResilientJSON(cleanedText);
      if (!summary) {
        throw new Error(`Worktree summary: failed to parse summary. Raw: ${formatErrorSnippet(text)}`);
      }

      const normalized = normalizeSummary(summary);
      if (!normalized) {
        throw new Error(`Worktree summary: empty normalized summary. Raw: ${formatErrorSnippet(summary)}`);
      }

      return {
        summary: normalized,
        modifiedCount
      };
    };

    try {
      return await withRetry(callModel, {
        maxRetries: 2,
        baseDelay: 300,
        shouldRetry: () => true,
      });
    } catch (error) {
      console.error('[canopy] Worktree summary retries exhausted', error);
      events.emit('ui:notify', {
        type: 'error',
        message: `AI summary failed: ${getUserMessage(error)}`
      });
      // Return null - WorktreeMonitor will show last commit as fallback
      return null;
    }
  } catch (error) {
    console.error('[canopy] generateWorktreeSummary failed', error);
    events.emit('ui:notify', {
      type: 'error',
      message: `Worktree summary error: ${getUserMessage(error)}`
    });
    // Return null - WorktreeMonitor will show last commit as fallback
    return null;
  }
}

/**
 * Enrich worktrees with AI summaries and file counts.
 * Updates worktrees in place asynchronously.
 *
 * @param worktrees - Worktrees to enrich
 * @param mainBranch - Main branch name for comparison
 * @param worktreeChangesMap - Map of worktree IDs to change details for smarter prioritization
 * @param onUpdate - Callback when a worktree summary is generated
 */
export async function enrichWorktreesWithSummaries(
  worktrees: Worktree[],
  mainBranch: string = 'main',
  worktreeChangesMap?: Map<string, import('../../types/index.js').WorktreeChanges>,
  onUpdate?: (worktree: Worktree) => void
): Promise<void> {
  // Mark all as loading
  for (const wt of worktrees) {
    wt.summaryLoading = true;
    if (onUpdate) onUpdate(wt);
  }

  // Generate summaries in parallel (but don't await - let them complete in background)
  const promises = worktrees.map(async (wt) => {
    try {
      const changesForThisWorktree = worktreeChangesMap?.get(wt.id);
      const summary = await generateWorktreeSummary(wt.path, wt.branch, mainBranch, changesForThisWorktree);
      if (summary) {
        wt.summary = summary.summary;
        wt.modifiedCount = summary.modifiedCount;
      } else if (!wt.summary) {
        wt.summary = 'Summary unavailable';
      }
    } catch (error) {
      console.error(`[canopy] Failed to generate summary for ${wt.path}`, error);
      if (!wt.summary) {
        wt.summary = 'Summary unavailable';
      }
    } finally {
      wt.summaryLoading = false;
      if (onUpdate) onUpdate(wt);
    }
  });

  await Promise.all(promises);
}
