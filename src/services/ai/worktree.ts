import { getAIClient } from './client.js';
import { extractOutputText } from './utils.js';
import simpleGit from 'simple-git';
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
 * @returns Summary and modified file count, or null if generation fails
 */
export async function generateWorktreeSummary(
  worktreePath: string,
  branchName: string | undefined,
  mainBranch: string = 'main'
): Promise<WorktreeSummary | null> {
  const client = getAIClient();
  if (!client) return null;

  try {
    const git = simpleGit(worktreePath);

    // Get modified file count
    const status = await git.status();
    const modifiedCount =
      status.modified.length +
      status.created.length +
      status.deleted.length +
      status.renamed.length;

    // Get diff between this branch and main
    let diff = '';
    try {
      // Try comparing with main branch
      diff = await git.diff([`${mainBranch}...HEAD`, '--stat']);
    } catch {
      // Fallback: get staged + unstaged changes
      try {
        diff = await git.diff(['--stat']);
      } catch {
        // If even that fails, just use status
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
    const input = `${branchContext}${diffSnippet}`;

    // Call AI model
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
      console.error('[canopy] Worktree summary: empty response from model');
      return { summary: branchName || 'Unknown work', modifiedCount };
    }

    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed.summary !== 'string') {
      console.error('[canopy] Worktree summary: invalid JSON shape');
      return { summary: branchName || 'Unknown work', modifiedCount };
    }

    return {
      summary: parsed.summary,
      modifiedCount
    };
  } catch (error) {
    console.error('[canopy] generateWorktreeSummary failed', error);
    return null;
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
      }
    } catch (error) {
      console.error(`[canopy] Failed to generate summary for ${wt.path}`, error);
    } finally {
      wt.summaryLoading = false;
      if (onUpdate) onUpdate(wt);
    }
  });

  await Promise.all(promises);
}
