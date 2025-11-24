import { getAIClient } from './client.js';
import { extractOutputText } from './utils.js';
import simpleGit from 'simple-git';
import { withRetry } from '../../utils/errorHandling.js';
import type { Worktree } from '../../types/index.js';

export interface WorktreeSummary {
  summary: string;
  modifiedCount: number;
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
  let diff = '';

  try {
    // Get modified file count
    const status = await git.status();
    modifiedCount =
      status.modified.length +
      status.created.length +
      status.deleted.length +
      status.renamed.length +
      status.not_added.length;

    // Get diff between this branch and main (broadest context)
    try {
      diff = await git.diff([`${mainBranch}...HEAD`, '--stat']);
    } catch {
      // ignore; fall through to other strategies
    }

    // Fallback: staged + unstaged working tree diff
    if (!diff.trim()) {
      try {
        diff = await git.diff(['--stat']);
      } catch {
        diff = '';
      }
    }

    // Fallback: status --short to include untracked files that diff omits
    if (!diff.trim() && modifiedCount > 0) {
      try {
        const statusShort = await git.status(['--short']);
        diff = statusShort.files
          .map(f => `${f.index}${f.working_dir} ${f.path}`)
          .slice(0, 50) // keep concise for prompt
          .join('\n');
      } catch {
        diff = '';
      }
    }

    // If no changes, return simple summary
    if (!diff.trim() && modifiedCount === 0) {
      return {
        summary: branchName ? `Clean: ${branchName}` : 'No changes',
        modifiedCount: 0
      };
    }

    // Prepare AI input
    const diffSnippet = diff.slice(0, 1500);
    const branchContext = branchName ? `Branch: ${branchName}\n` : '';
    const input = `${branchContext}Files changed:\n${diffSnippet}`;

    const callModel = async (): Promise<WorktreeSummary> => {
      const response = await client.responses.create({
        model: 'gpt-5-nano',
        instructions: 'Summarize git changes in max 5 words. Be specific about what feature/fix is being worked on. Examples: "Adding user authentication", "Fixed API timeout bug", "Refactored database queries". Focus on the "what", not the "how".',
        input,
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
                  description: 'Maximum 5 words describing the work',
                  maxLength: 40
                }
              },
              required: ['summary'],
              additionalProperties: false
            }
          }
        },
        reasoning: { effort: 'minimal' },
        max_output_tokens: 32
      } as any);

      const text = extractOutputText(response);
      if (!text) {
        throw new Error('Worktree summary: empty response from model');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error(`Worktree summary: invalid JSON (${(error as Error).message})`);
      }

      if (!parsed || typeof (parsed as Record<string, unknown>).summary !== 'string') {
        throw new Error('Worktree summary: missing summary in model response');
      }

      return {
        summary: (parsed as { summary: string }).summary,
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
      return {
        summary: branchName ? `${branchName} (analysis unavailable)` : 'Analysis unavailable',
        modifiedCount
      };
    }
  } catch (error) {
    console.error('[canopy] generateWorktreeSummary failed', error);
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
