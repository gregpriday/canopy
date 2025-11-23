import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Worktree, WorktreeChanges } from '../types/index.js';
import {
  getWorktreeChangesWithStats,
  invalidateGitStatusCache,
  isGitRepository,
} from '../utils/git.js';
import { logWarn } from '../utils/logger.js';
import { events } from '../services/events.js';

export interface MultiWorktreeRefreshConfig {
  activeMs?: number;
  backgroundMs?: number;
}

export interface UseMultiWorktreeStatusReturn {
  worktreeChanges: Map<string, WorktreeChanges>;
  refresh: (worktreeId?: string, force?: boolean) => void;
  clear: () => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const DEFAULT_ACTIVE_MS = 1500; // 1.5s for active worktree
const DEFAULT_BACKGROUND_MS = 10000; // 10s for background worktrees

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
  refreshConfig: MultiWorktreeRefreshConfig = {},
  enabled: boolean = true
): UseMultiWorktreeStatusReturn {
  const [worktreeChanges, setWorktreeChanges] = useState<
    Map<string, WorktreeChanges>
  >(new Map());

  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());
  const mountedRef = useRef<boolean>(true);

  const { activeMs, backgroundMs } = useMemo(() => {
    const active = clamp(
      refreshConfig.activeMs ?? DEFAULT_ACTIVE_MS,
      1000,
      2000,
    );
    const background = clamp(
      refreshConfig.backgroundMs ?? DEFAULT_BACKGROUND_MS,
      10000,
      30000,
    );
    return { activeMs: active, backgroundMs: background };
  }, [refreshConfig.activeMs, refreshConfig.backgroundMs]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(timer => clearInterval(timer));
    timersRef.current.clear();
  }, []);

  const setChangesForWorktree = useCallback(
    (worktreeId: string, changes: WorktreeChanges) => {
      if (!mountedRef.current) return;
      setWorktreeChanges(prev => {
        const next = new Map(prev);
        next.set(worktreeId, changes);
        return next;
      });
    },
    [],
  );

  const fetchStatusForWorktree = useCallback(
    async (worktree: Worktree, forceRefresh = false) => {
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
          logWarn('Failed to fetch git status for worktree', {
            worktree: worktree.path,
            message: (error as Error).message,
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

    // Clean up any previous timers
    clearTimers();

    // Remove changes for worktrees that no longer exist
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
      // Immediate fetch on (re)subscription
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
  }, [
    activeMs,
    activeWorktreeId,
    backgroundMs,
    clear,
    clearTimers,
    enabled,
    fetchStatusForWorktree,
    worktrees,
  ]);

  // React to global refresh events
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
