import { useState, useEffect, useRef, useCallback } from 'react';
import { enrichWorktreesWithSummaries } from '../services/ai/worktree.js';
import { categorizeWorktree } from '../utils/worktreeMood.js';
import type { Worktree, WorktreeChanges } from '../types/index.js';

const AI_DEBOUNCE_MS = 10000;
const DEBUG = process.env.CANOPY_DEBUG_SUMMARIES === '1';

export function useWorktreeSummaries(
  worktrees: Worktree[],
  mainBranch: string = 'main',
  worktreeChanges?: Map<string, WorktreeChanges>,
  debounceOverrideMs?: number,
): Worktree[] {
  const [enrichedWorktrees, setEnrichedWorktrees] = useState<Worktree[]>(worktrees);

  const latestDataRef = useRef({ worktrees, worktreeChanges });
  const lastProcessedRef = useRef<Map<string, number>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEnrichingRef = useRef(false);
  const debounceMs = debounceOverrideMs ?? AI_DEBOUNCE_MS;

  useEffect(() => {
    latestDataRef.current = { worktrees, worktreeChanges };
  });

  useEffect(() => {
    setEnrichedWorktrees(prev => {
      const prevMap = new Map(prev.map(wt => [wt.id, wt]));
      return worktrees.map(wt => {
        const existing = prevMap.get(wt.id);
        return {
          ...wt,
          summary: existing?.summary,
          mood: existing?.mood,
          modifiedCount: wt.modifiedCount ?? existing?.modifiedCount,
          summaryLoading: existing?.summaryLoading ?? false,
        };
      });
    });
  }, [worktrees]);

  const processEnrichment = useCallback(async () => {
    if (isEnrichingRef.current) return;

    const { worktrees: currentWorktrees, worktreeChanges: currentChanges } = latestDataRef.current;
    if (currentWorktrees.length === 0) return;

    const candidates = currentWorktrees.filter(wt => {
      const changes = currentChanges?.get(wt.id);
      const lastProcessedMtime = lastProcessedRef.current.get(wt.id);

      if (!changes) return false;

      const currentMtime = changes.latestFileMtime ?? 0;
      const changedCount = changes.changedFileCount;

      if (changedCount === 0) {
        return lastProcessedMtime === undefined || lastProcessedMtime !== 0;
      }

      return lastProcessedMtime === undefined || currentMtime !== lastProcessedMtime;
    });

    if (candidates.length === 0) return;

    if (DEBUG) console.log(`[AI] Processing ${candidates.length} candidates`);

    isEnrichingRef.current = true;
    try {
      const handleUpdate = (updated: Worktree) => {
        setEnrichedWorktrees(prev => prev.map(p => {
          if (p.id !== updated.id) return p;
          // Preserve existing summary if updated doesn't have one
          // This prevents the "flash" where summary disappears during refresh
          return {
            ...p,
            ...updated,
            summary: updated.summary ?? p.summary,
          };
        }));

        const changes = currentChanges?.get(updated.id);
        const newMtime =
          changes?.changedFileCount === 0 ? 0 : (changes?.latestFileMtime ?? Date.now());

        if (!updated.summaryLoading) {
          lastProcessedRef.current.set(updated.id, newMtime);
        }
      };

      await enrichWorktreesWithSummaries(
        candidates,
        mainBranch,
        currentChanges,
        (updatedWt: Worktree) => {
          handleUpdate(updatedWt);
          void categorizeWorktree(updatedWt, currentChanges?.get(updatedWt.id), mainBranch).then(mood => {
            handleUpdate({ ...updatedWt, mood });
          });
        },
      );
    } finally {
      isEnrichingRef.current = false;
    }
  }, [mainBranch]);

  useEffect(() => {
    const { worktrees: currentWorktrees, worktreeChanges: currentChanges } = latestDataRef.current;

    const hasCriticalUpdate = currentWorktrees.some(wt => {
      const changes = currentChanges?.get(wt.id);
      const lastMtime = lastProcessedRef.current.get(wt.id);
      const currentMtime = changes?.latestFileMtime ?? 0;
      const count = changes?.changedFileCount ?? 0;
      return count === 0 && lastMtime !== 0;
    });

    if (timerRef.current) clearTimeout(timerRef.current);

    if (hasCriticalUpdate || debounceMs === 0) {
      if (DEBUG && hasCriticalUpdate) console.log('[AI] Critical update detected - skipping debounce');
      void processEnrichment();
    } else {
      timerRef.current = setTimeout(() => {
        void processEnrichment();
      }, debounceMs);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [worktreeChanges, processEnrichment]);

  return enrichedWorktrees;
}
