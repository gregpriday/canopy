import { useState, useEffect, useRef, useCallback } from 'react';
import type { Worktree } from '../types/index.js';
import { enrichWorktreesWithSummaries } from '../services/ai/worktree.js';

/**
 * Hook to manage AI-generated summaries for worktrees.
 * Enriches worktrees with summaries in the background without blocking UI.
 *
 * @param worktrees - Array of worktrees to enrich
 * @param mainBranch - Main branch to compare against (default: 'main')
 * @param refreshIntervalMs - Optional auto-refresh interval (0 = disabled)
 * @returns Enriched worktrees with summaries, loading states, and counts
 */
export function useWorktreeSummaries(
  worktrees: Worktree[],
  mainBranch: string = 'main',
  refreshIntervalMs: number = 0
): Worktree[] {
  const [enrichedWorktrees, setEnrichedWorktrees] = useState<Worktree[]>(worktrees);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isEnrichingRef = useRef(false);

  // Update enriched worktrees when input worktrees change
  useEffect(() => {
    setEnrichedWorktrees(worktrees);
  }, [worktrees]);

  // Enrich worktrees with AI summaries
  const enrichWorktrees = useCallback(async () => {
    // Skip if no API key or already enriching
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    if (!hasApiKey || isEnrichingRef.current || worktrees.length === 0) {
      return;
    }

    isEnrichingRef.current = true;

    try {
      // Create a mutable copy of worktrees
      const mutableWorktrees = worktrees.map(wt => ({ ...wt }));

      // Enrich with summaries (this updates in place and calls onUpdate)
      await enrichWorktreesWithSummaries(
        mutableWorktrees,
        mainBranch,
        (updatedWorktree) => {
          // Update state as each summary completes
          setEnrichedWorktrees(prev =>
            prev.map(wt =>
              wt.id === updatedWorktree.id
                ? { ...wt, ...updatedWorktree }
                : wt
            )
          );
        }
      );
    } catch (error) {
      console.error('[canopy] useWorktreeSummaries: enrichment failed', error);
    } finally {
      isEnrichingRef.current = false;
    }
  }, [mainBranch, worktrees]);

  // Initial enrichment when worktrees change
  useEffect(() => {
    enrichWorktrees();
  }, [enrichWorktrees]);

  // Set up refresh interval if enabled
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Set up new interval if refreshIntervalMs > 0
    if (refreshIntervalMs > 0) {
      intervalRef.current = setInterval(() => {
        enrichWorktrees();
      }, refreshIntervalMs);
    }

    // Cleanup on unmount or when interval changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refreshIntervalMs, enrichWorktrees]);

  return enrichedWorktrees;
}
