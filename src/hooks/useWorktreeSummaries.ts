import { useState, useEffect, useRef, useCallback } from 'react';
import type { Worktree, WorktreeChanges } from '../types/index.js';
import { enrichWorktreesWithSummaries } from '../services/ai/worktree.js';
import { categorizeWorktree } from '../utils/worktreeMood.js';

const AI_DEBOUNCE_MS = 10000;
const DEBUG = process.env.CANOPY_DEBUG_SUMMARIES === '1';

export function useWorktreeSummaries(
  worktrees: Worktree[],
  mainBranch: string = 'main',
  worktreeChanges?: Map<string, WorktreeChanges>
): Worktree[] {
  const [enrichedWorktrees, setEnrichedWorktrees] = useState<Worktree[]>(worktrees);

  // Refs to hold latest data (breaks dependency chains)
  const latestDataRef = useRef({ worktrees, worktreeChanges });

  // Track last processed mtime to prevent reprocessing unchanged trees
  const lastProcessedRef = useRef<Map<string, number>>(new Map());

  // Timer management
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isEnrichingRef = useRef(false);

  // 1. Keep refs in sync with render cycle
  useEffect(() => {
    latestDataRef.current = { worktrees, worktreeChanges };
  });

  // 2. Sync local state when props change (preserves existing summaries)
  useEffect(() => {
    setEnrichedWorktrees(prev => {
      const prevMap = new Map(prev.map(wt => [wt.id, wt]));
      return worktrees.map(wt => {
        const existing = prevMap.get(wt.id);
        return {
          ...wt,
          // Preserve summary/mood/loading state from local state
          summary: existing?.summary,
          mood: existing?.mood,
          modifiedCount: wt.modifiedCount ?? existing?.modifiedCount,
          summaryLoading: existing?.summaryLoading ?? false,
        };
      });
    });
  }, [worktrees]); // Only run when the worktree list structure changes

  // 3. The Enrichment Logic (Stable Callback)
  const processEnrichment = useCallback(async () => {
    if (isEnrichingRef.current) return;

    const { worktrees: currentWorktrees, worktreeChanges: currentChanges } = latestDataRef.current;
    if (currentWorktrees.length === 0) return;

    // Identify candidates
    const candidates = currentWorktrees.filter(wt => {
      const changes = currentChanges?.get(wt.id);
      const lastProcessedMtime = lastProcessedRef.current.get(wt.id);

      // Case A: No change data yet (skip)
      if (!changes) return false;

      const currentMtime = changes.latestFileMtime ?? 0;
      const changedCount = changes.changedFileCount;

      // Case B: Worktree is Clean (0 files)
      // We MUST update if we haven't processed this "clean state" yet (mtime 0)
      // or if we have never processed it.
      if (changedCount === 0) {
        return lastProcessedMtime === undefined || lastProcessedMtime !== 0;
      }

      // Case C: Worktree is Dirty
      // Update if the modification time differs from what we last processed
      return lastProcessedMtime === undefined || currentMtime !== lastProcessedMtime;
    });

    if (candidates.length === 0) return;

    if (DEBUG) console.log(`[AI] Processing ${candidates.length} candidates`);

    isEnrichingRef.current = true;

    try {
      // Helper to update state immediately as results come in
      const handleUpdate = (updated: Worktree) => {
        setEnrichedWorktrees(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));

        // Update cache tracker
        const changes = currentChanges?.get(updated.id);
        const newMtime = changes?.changedFileCount === 0 ? 0 : (changes?.latestFileMtime ?? Date.now());

        if (!updated.summaryLoading) {
           lastProcessedRef.current.set(updated.id, newMtime);
        }
      };

      // Use existing service (it handles API keys and zero-cost fallback internally)
      await enrichWorktreesWithSummaries(
        candidates,
        mainBranch,
        currentChanges,
        (updatedWt) => {
          // 1. Update Summary
          handleUpdate(updatedWt);

          // 2. Update Mood (Async)
          void categorizeWorktree(
            updatedWt,
            currentChanges?.get(updatedWt.id),
            mainBranch
          ).then(mood => {
            handleUpdate({ ...updatedWt, mood });
          });
        }
      );
    } finally {
      isEnrichingRef.current = false;
    }
  }, [mainBranch]);

  // 4. The Trigger Effect (Smart Debounce)
  useEffect(() => {
    const { worktrees, worktreeChanges } = latestDataRef.current;

    // Determine if we have a "Critical" update (Clean transition)
    // A critical update skips the debounce.
    const hasCriticalUpdate = worktrees.some(wt => {
      const changes = worktreeChanges?.get(wt.id);
      const lastMtime = lastProcessedRef.current.get(wt.id);
      const currentMtime = changes?.latestFileMtime ?? 0;
      const count = changes?.changedFileCount ?? 0;

      // If it's clean (count 0) and we haven't processed that (lastMtime != 0), it's critical.
      // This ensures "Last commit" shows up instantly.
      return count === 0 && lastMtime !== 0;
    });

    // Clear existing timer
    if (timerRef.current) clearTimeout(timerRef.current);

    if (hasCriticalUpdate) {
      if (DEBUG) console.log('[AI] Critical update detected - skipping debounce');
      void processEnrichment();
    } else {
      // Standard debounce for dirty states (user is typing)
      timerRef.current = setTimeout(() => {
        void processEnrichment();
      }, AI_DEBOUNCE_MS);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [worktreeChanges, processEnrichment]); // Re-run when changes map updates

  return enrichedWorktrees;
}
