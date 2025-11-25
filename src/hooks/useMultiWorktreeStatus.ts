import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getWorktreeChangesWithStats,
  invalidateGitStatusCache,
  isGitRepository,
} from '../utils/git.js';
import { logWarn } from '../utils/logger.js';
import { events } from '../services/events.js';
import type { Worktree, WorktreeChanges } from '../types/index.js';

const ACTIVE_WORKTREE_INTERVAL_MS = 5000; // 5s for active worktree
const BACKGROUND_WORKTREE_INTERVAL_MS = 300000; // 5 minutes for background worktrees (PERF: reduced CPU usage)

export interface UseMultiWorktreeStatusReturn {
  worktreeChanges: Map<string, WorktreeChanges>;
  refresh: (worktreeId?: string, force?: boolean) => void;
  clear: () => void;
}

/**
 * Poll git status for all detected worktrees with smarter intervals.
 *
 * - Active worktree: fast refresh (1–2s)
 * - Background worktrees: slower refresh (10–30s)
 * - Errors are isolated per worktree so one failure won't affect others
 */
export function useMultiWorktreeStatus(
  worktrees: Worktree[],
  activeWorktreeId: string | null,
  enabled: boolean = true,
): UseMultiWorktreeStatusReturn {
  const [worktreeChanges, setWorktreeChanges] = useState<Map<string, WorktreeChanges>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());
  const mountedRef = useRef(true);

  const activeMs = ACTIVE_WORKTREE_INTERVAL_MS;
  const backgroundMs = BACKGROUND_WORKTREE_INTERVAL_MS;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(timer => clearInterval(timer));
    timersRef.current.clear();
  }, []);

  const setChangesForWorktree = useCallback(
    (worktreeId: string, changes: WorktreeChanges) => {
      if (!mountedRef.current) return;

      setWorktreeChanges(prev => {
        const existing = prev.get(worktreeId);

        if (
          existing &&
          existing.changedFileCount === changes.changedFileCount &&
          existing.latestFileMtime === changes.latestFileMtime &&
          existing.totalInsertions === changes.totalInsertions &&
          existing.totalDeletions === changes.totalDeletions
        ) {
          return prev;
        }

        const next = new Map(prev);
        next.set(worktreeId, changes);
        return next;
      });
    },
    [],
  );

  const fetchStatusForWorktree = useCallback(
    async (worktree: Worktree, forceRefresh: boolean = false) => {
      if (!enabled) {
        return;
      }

      // Prevent overlapping fetches for the same worktree
      if (inflightRef.current.has(worktree.id)) {
        return inflightRef.current.get(worktree.id);
      }

      const fetchPromise = (async () => {
        try {
          const isRepo = await isGitRepository(worktree.path);
          if (!isRepo) {
            setChangesForWorktree(worktree.id, {
              worktreeId: worktree.id,
              rootPath: worktree.path,
              changes: [],
              changedFileCount: 0,
              totalInsertions: 0,
              totalDeletions: 0,
              insertions: 0,
              deletions: 0,
              latestFileMtime: 0,
              lastUpdated: Date.now(),
            });
            return;
          }

          if (forceRefresh) {
            invalidateGitStatusCache(worktree.path);
          }

          const changes = await getWorktreeChangesWithStats(worktree.path, forceRefresh);
          setChangesForWorktree(worktree.id, {
            ...changes,
            worktreeId: worktree.id,
            rootPath: changes.rootPath || worktree.path,
          });
        } catch (error) {
          const err = error as Error;
          logWarn('Failed to fetch git status for worktree', {
            worktree: worktree.path,
            message: err.message,
          });
          // Keep previous state intact; error is isolated to this worktree
        } finally {
          inflightRef.current.delete(worktree.id);
        }
      })();

      inflightRef.current.set(worktree.id, fetchPromise);
      return fetchPromise;
    },
    [enabled, setChangesForWorktree],
  );

  const refresh = useCallback(
    (worktreeId?: string, forceRefresh: boolean = true) => {
      if (!enabled) {
        return;
      }

      if (worktreeId) {
        const target = worktrees.find(wt => wt.id === worktreeId);
        if (target) {
          void fetchStatusForWorktree(target, forceRefresh);
        }
        return;
      }

      for (const wt of worktrees) {
        void fetchStatusForWorktree(wt, forceRefresh);
      }
    },
    [enabled, fetchStatusForWorktree, worktrees],
  );

  const clear = useCallback(() => {
    clearTimers();
    inflightRef.current.clear();
    setWorktreeChanges(new Map());
  }, [clearTimers]);

  // Update polling schedule when worktrees or active ID change
  useEffect(() => {
    if (!enabled) {
      clear();
      return;
    }

    clearTimers();

    setWorktreeChanges(prev => {
      const next = new Map<string, WorktreeChanges>();
      for (const wt of worktrees) {
        const existing = prev.get(wt.id);
        if (existing) {
          next.set(wt.id, existing);
        }
      }
      return next;
    });

    for (const wt of worktrees) {
      void fetchStatusForWorktree(wt, true);
      const intervalMs = wt.id === activeWorktreeId ? activeMs : backgroundMs;
      if (intervalMs <= 0) continue;
      const timer = setInterval(() => {
        void fetchStatusForWorktree(wt);
      }, intervalMs);
      timersRef.current.set(wt.id, timer);
    }

    return () => {
      clearTimers();
    };
  }, [activeWorktreeId, clear, clearTimers, enabled, fetchStatusForWorktree, worktrees, activeMs, backgroundMs]);

  useEffect(() => {
    return events.on('sys:refresh', () => refresh(undefined, true));
  }, [refresh]);

  useEffect(() => {
    return events.on('sys:worktree:refresh', () => refresh(undefined, true));
  }, [refresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clear();
    };
  }, [clear]);

  return {
    worktreeChanges,
    refresh,
    clear,
  };
}
