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
const MAX_WORDS = 8;

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

function normalizeSummary(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const compressed = firstLine.replace(/\s+/g, ' ').trim();
  if (!compressed) return '';

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
  const client = getAIClient();
  if (!client) return null;

  const git = simpleGit(worktreePath);
  let modifiedCount = 0;
  let lastCommitMsg = '';
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

    if (modifiedCount === 0) {
      return {
        summary: branchName ? `Clean: ${branchName}` : 'No changes',
        modifiedCount: 0
      };
    }

    try {
      const log = await git.log({ maxCount: 1 });
      lastCommitMsg = log.latest?.message ?? '';
    } catch {
      lastCommitMsg = '';
    }

    const branchLabel = branchName ?? mainBranch ?? '';
    const branchContext = branchLabel ? `Branch: ${branchLabel}` : '';
    promptContext = branchContext ? `${branchContext}\n` : '';
    if (lastCommitMsg) {
      promptContext += `Last Commit: "${lastCommitMsg}"\n`;
    }
    promptContext += '\n--- CHANGES ---\n';

    if (deletedFiles.length > 0) {
      promptContext += `Deleted files:\n- ${deletedFiles.join('\n- ')}\n`;
    }

    if (renamedFiles.length > 0) {
      promptContext += `Renamed:\n- ${renamedFiles.join('\n- ')}\n`;
    }

    const filesForDiff = Array.from(new Set([...createdFiles, ...modifiedFiles, ...renamedTargets]));
    const MAX_DIFF_LINES = 50;
    const MAX_INPUT_CHARS = 6000;

    for (const file of filesForDiff) {
      if (/(^|\/)package-lock\.json$|\.map$|\.svg$|\.png$/i.test(file)) {
        continue;
      }

      try {
        const isNewFile = createdFiles.includes(file);
        let diff = '';

        if (isNewFile) {
          const content = await fs.readFile(path.join(worktreePath, file), 'utf8');
          diff = content.split('\n').slice(0, 20).join('\n');
        } else {
          diff = await git.diff(['--unified=0', '--minimal', '-w', 'HEAD', '--', file]);
        }

        const cleanDiff = diff
          .split('\n')
          .filter(line => !line.startsWith('index ') && !line.startsWith('diff --git'))
          .slice(0, MAX_DIFF_LINES)
          .join('\n');

        if (cleanDiff.trim()) {
          promptContext += `\nFile: ${file}\n${cleanDiff}\n`;
        }
      } catch {
        // Skip unreadable files
      }

      if (promptContext.length > MAX_INPUT_CHARS) {
        promptContext = `${promptContext.slice(0, MAX_INPUT_CHARS)}\n... (truncated)`;
        break;
      }
    }

    if (!promptContext.trim()) {
      promptContext = branchContext || 'Worktree changes';
    }

    const callModel = async (): Promise<WorktreeSummary> => {
      const response = await client.responses.create({
        model: 'gpt-5-nano',
        instructions: `You are a git worktree summarizer. You receive: branch name, last commit message, and file changes.
Respond with ONE line of plain text that starts with a single emoji representing the work, followed by up to 8 words.
No quotes, no JSON, no bullets, no prefixes, no extra lines. We only read your first line.
Examples:
🚧 Building dashboard filters for sprint demo
🔧 Tweaking CLI flags to speed sync runs
✅ Fixing flaky tests in auth handshake
🎨 Updating auth page styles for clarity`,
        input: promptContext,
        reasoning: { effort: 'minimal' },
        max_output_tokens: 32
      } as any);

      const text = extractOutputText(response);
      if (!text) {
        throw new Error(`Worktree summary: empty response from model. Raw: ${formatErrorSnippet(response)}`);
      }

      const summary = normalizeSummary(text);
      if (!summary) {
        throw new Error(`Worktree summary: empty normalized summary. Raw: ${formatErrorSnippet(text)}`);
      }

      return {
        summary,
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
