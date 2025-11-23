import { useState, useEffect, useRef, useCallback } from 'react';
import type { Worktree, WorktreeChanges } from '../types/index.js';
import { enrichWorktreesWithSummaries } from '../services/ai/worktree.js';
import { categorizeWorktree } from '../utils/worktreeMood.js';

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
  refreshIntervalMs: number = 0,
  worktreeChanges?: Map<string, WorktreeChanges>
): Worktree[] {
  const [enrichedWorktrees, setEnrichedWorktrees] = useState<Worktree[]>(worktrees);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isEnrichingRef = useRef(false);
  const lastProcessedRef = useRef<Map<string, number>>(new Map());

  // Remove stale processed markers when worktrees list changes
  useEffect(() => {
    const activeIds = new Set(worktrees.map(wt => wt.id));
    for (const id of Array.from(lastProcessedRef.current.keys())) {
      if (!activeIds.has(id)) {
        lastProcessedRef.current.delete(id);
      }
    }
  }, [worktrees]);

  // Enrich worktrees with AI summaries
  const enrichWorktrees = useCallback(async () => {
    // Skip if already enriching or no worktrees
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    if (isEnrichingRef.current || worktrees.length === 0) {
      return;
    }

    // Only run AI if there is a file-level change we haven't already processed.
    const worktreesToUpdate = worktrees.filter(wt => {
      const changes = worktreeChanges?.get(wt.id);
      const lastProcessed = lastProcessedRef.current.get(wt.id);
      const latestMtime = changes?.latestFileMtime;

      // If we don't have any change info yet, run once to seed summaries.
      if (changes === undefined || latestMtime === undefined) {
        return lastProcessed === undefined;
      }

      return lastProcessed === undefined || latestMtime > lastProcessed;
    });

    if (worktreesToUpdate.length === 0) {
      return;
    }

    isEnrichingRef.current = true;

    try {
      // Create a mutable copy of worktrees and prioritize those with changes
      const mutableWorktreesById = new Map<string, Worktree>();
      for (const wt of worktreesToUpdate) {
        mutableWorktreesById.set(wt.id, { ...wt });
      }

      const getChangedCount = (id: string) =>
        worktreeChanges?.get(id)?.changedFileCount ?? 0;

      const prioritizedWorktrees = Array.from(mutableWorktreesById.values()).sort(
        (a, b) => getChangedCount(b.id) - getChangedCount(a.id)
      );

      // Helper to apply updates to state in original order
      const applyUpdate = (updated: Worktree) => {
        setEnrichedWorktrees(prev =>
          prev.map(wt => {
            if (wt.id !== updated.id) return wt;
            return {
              ...wt,
              ...updated,
              // Preserve existing data when upstream refresh sends undefined fields
              summary: updated.summary ?? wt.summary,
              mood: updated.mood ?? wt.mood,
            };
          })
        );

        if (!updated.summaryLoading) {
          const processedAt =
            worktreeChanges?.get(updated.id)?.latestFileMtime ?? Date.now();
          lastProcessedRef.current.set(updated.id, processedAt);
        }
      };

      if (hasApiKey) {
        await enrichWorktreesWithSummaries(
          prioritizedWorktrees,
          mainBranch,
          (updatedWorktree) => {
            // Async mood update; fire-and-forget to avoid blocking summary flow
            void (async () => {
              const mood = await categorizeWorktree(
                updatedWorktree,
                worktreeChanges?.get(updatedWorktree.id),
                mainBranch
              );
              applyUpdate({ ...updatedWorktree, mood });
            })();
          }
        );
      } else {
        // No API key: still categorize mood so UI can reflect state
        for (const wt of prioritizedWorktrees) {
          const mood = await categorizeWorktree(
            wt,
            worktreeChanges?.get(wt.id),
            mainBranch
          );
          wt.mood = mood;
          wt.summaryLoading = false;
          applyUpdate(wt);
        }
      }
    } catch (error) {
      console.error('[canopy] useWorktreeSummaries: enrichment failed', error);
    } finally {
      isEnrichingRef.current = false;
    }
  }, [mainBranch, worktreeChanges, worktrees]);

  // Sync enriched worktrees with lifecycle updates and trigger enrichment
  // Preserve existing summaries/loading flags so periodic worktree refreshes
  // don't wipe AI results before new work arrives.
  useEffect(() => {
    setEnrichedWorktrees(prev => {
      const prevById = new Map(prev.map(wt => [wt.id, wt]));
      return worktrees.map(wt => {
        const previous = prevById.get(wt.id);
        if (!previous) return wt;
        return {
          ...wt,
          summary: previous.summary,
          summaryLoading: previous.summaryLoading,
          mood: previous.mood,
          modifiedCount: wt.modifiedCount ?? previous.modifiedCount,
        };
      });
    });
    void enrichWorktrees();
  }, [worktrees, enrichWorktrees]);

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
