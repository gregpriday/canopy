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
 * @returns Summary and modified file count, or null if AI client is unavailable
 */
export async function generateWorktreeSummary(
  worktreePath: string,
  branchName: string | undefined,
  mainBranch: string = 'main'
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
    if (modifiedCount === 0) {
      try {
        const log = await git.log({ maxCount: 1 });
        const lastCommitMsg = log.latest?.message ?? '';
        if (lastCommitMsg) {
          // Use first line of commit message only
          const firstLine = lastCommitMsg.split('\n')[0].trim();
          return {
            summary: firstLine,
            modifiedCount: 0
          };
        }
      } catch {
        // No commits or git error - fall through to default
      }

      // Edge case: no commits exist yet
      return {
        summary: branchName ? `Clean: ${branchName}` : 'No changes',
        modifiedCount: 0
      };
    }

    // --- AI GENERATION SECTION STARTS HERE ---
    // Check for AI client before attempting generation
    const client = getAIClient();
    if (!client) {
      // If we have changes but no AI, return null so UI shows "No summary available"
      return null;
    }

    // Start with deleted files (minimal info)
    if (deletedFiles.length > 0) {
      promptContext += deletedFiles.map(f => `Deleted: ${f}`).join('\n') + '\n\n';
    }

    if (renamedFiles.length > 0) {
      promptContext += renamedFiles.map(r => `Renamed: ${r}`).join('\n') + '\n\n';
    }

    // Step 1: Aggressive noise filtering
    const IGNORED_PATTERNS = [
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /\.map$/,
      /\.svg$/, /\.png$/, /\.ico$/, /\.jpg$/, /\.jpeg$/,
      /^dist\//, /^build\//, /^\.next\//
    ];

    const isHighValue = (file: string) => !IGNORED_PATTERNS.some(p => p.test(file));
    const filesForDiff = Array.from(new Set([...createdFiles, ...modifiedFiles, ...renamedTargets]))
      .filter(isHighValue);

    // Step 4: Smart context budgeting - sort by importance
    filesForDiff.sort((a, b) => {
      const aScore = (a.startsWith('src/') ? 0 : 1) + a.length * 0.01;
      const bScore = (b.startsWith('src/') ? 0 : 1) + b.length * 0.01;
      return aScore - bScore;
    });

    const CHAR_LIMIT = 1500; // Strict token budget
    let currentLength = 0;

    for (const file of filesForDiff) {
      if (currentLength >= CHAR_LIMIT) break;

      try {
        const isNewFile = createdFiles.includes(file);
        let diff = '';

        if (isNewFile) {
          // Step 3: Skeletonize new files - only extract structural definitions
          const content = await fs.readFile(path.join(worktreePath, file), 'utf8');
          const lines = content.split('\n');

          const skeleton = lines
            .filter(line => /^(import|export|class|function|interface|type|const|let|var)\s/.test(line.trim()))
            .slice(0, 15)
            .join('\n');

          diff = skeleton ? `NEW FILE STRUCTURE:\n${skeleton}` : `NEW FILE: ${file}`;
        } else {
          // Step 2: Zero-context diffs - only the changed lines
          diff = await git.diff([
            '--unified=0',           // 0 lines of context (crucial for token savings)
            '--minimal',             // Smallest diff possible
            '--ignore-all-space',    // Ignore whitespace-only changes
            '--ignore-blank-lines',  // Ignore blank line changes
            'HEAD',
            '--',
            file
          ]);
        }

        const cleanDiff = diff
          .split('\n')
          .filter(line => !line.startsWith('index ') && !line.startsWith('diff --git'))
          .join('\n');

        if (cleanDiff.trim()) {
          const diffBlock = `\nFile: ${file}\n${cleanDiff}\n`;
          promptContext += diffBlock;
          currentLength += diffBlock.length;
        }
      } catch {
        // Skip unreadable files
      }
    }

    if (!promptContext.trim()) {
      promptContext = 'Worktree changes';
    }

    const callModel = async (): Promise<WorktreeSummary> => {
      const response = await client.responses.create({
        model: 'gpt-5-nano',
        instructions: `Summarize the git diffs into a single active-tense sentence (max 10 words).
Ignore imports, formatting, and minor refactors.
Focus on the feature being added or the bug being fixed.
Start with an emoji.
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
      return {
        summary: branchName ? `${branchName} (analysis unavailable)` : 'Analysis unavailable',
        modifiedCount
      };
    }
  } catch (error) {
    console.error('[canopy] generateWorktreeSummary failed', error);
    events.emit('ui:notify', {
      type: 'error',
      message: `Worktree summary error: ${getUserMessage(error)}`
    });
    return {
      summary: branchName ? `${branchName} (git unavailable)` : 'Git status unavailable',
      modifiedCount
    };
  }
}

/**
 * Enrich worktrees with AI summaries and file counts.
 * Updates worktrees in place asynchronously.
 *
 * @param worktrees - Worktrees to enrich
 * @param mainBranch - Main branch name for comparison
 * @param onUpdate - Callback when a worktree summary is generated
 */
export async function enrichWorktreesWithSummaries(
  worktrees: Worktree[],
  mainBranch: string = 'main',
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
      const summary = await generateWorktreeSummary(wt.path, wt.branch, mainBranch);
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
