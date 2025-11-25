import { useState, useEffect, useCallback, useRef } from 'react';
import { getCommitCount } from '../utils/git.js';
import { getIssueCount, getPrCount, checkGitHubCli } from '../utils/github.js';
import { events } from '../services/events.js';

// Polling configuration constants
const IDLE_POLL_INTERVAL = 5 * 60 * 1000;     // 5 minutes when idle
const ACTIVE_POLL_INTERVAL = 30 * 1000;       // 30 seconds when active
const ACTIVE_WINDOW_DURATION = 2 * 60 * 1000; // Stay "active" for 2 mins after last event

export interface RepositoryStats {
  commitCount: number;
  issueCount: number | null; // null means GitHub CLI unavailable/error
  prCount: number | null;
  loading: boolean;
}

/**
 * Hook to fetch and poll repository stats (commit count, issue count, PR count).
 * Uses adaptive polling that responds to user activity:
 * - Active mode (30s): When user is actively working (file saves, manual refresh)
 * - Idle mode (5min): When no activity detected for 2+ minutes
 *
 * Listens to:
 * - `watcher:change` - File changes boost activity state
 * - `sys:refresh` - Manual refresh (r key) triggers immediate fetch and boosts activity
 *
 * @param cwd - Working directory
 * @param enabled - Whether to enable polling (default: true)
 * @returns Repository stats object
 */
export function useRepositoryStats(cwd: string, enabled: boolean = true): RepositoryStats {
  const [stats, setStats] = useState<RepositoryStats>({
    commitCount: 0,
    issueCount: null,
    prCount: null,
    loading: true,
  });

  // Track user activity and prevent concurrent fetches
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);

  const fetchStats = useCallback(async () => {
    if (isFetchingRef.current || !enabled) return;
    isFetchingRef.current = true;

    try {
      // Run commit count and GitHub CLI check in parallel
      const [commits, hasGh] = await Promise.all([
        getCommitCount(cwd),
        checkGitHubCli(cwd)
      ]);

      let issues: number | null = null;
      let prs: number | null = null;

      // Only fetch GitHub stats if CLI is available
      if (hasGh) {
        [issues, prs] = await Promise.all([
          getIssueCount(cwd),
          getPrCount(cwd)
        ]);
      }

      setStats({
        commitCount: commits,
        issueCount: issues,
        prCount: prs,
        loading: false
      });
    } catch {
      // Fail silently for stats - don't disrupt the UI
      setStats(s => ({ ...s, loading: false }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [cwd, enabled]);

  // Variable interval polling using setTimeout chain
  useEffect(() => {
    if (!enabled) return;

    // Track whether the effect has been cleaned up to prevent scheduling after unmount
    let aborted = false;

    const scheduleNext = () => {
      // Don't schedule if the hook has been cleaned up
      if (aborted) return;

      // Determine if user is currently active
      const isUserActive = (Date.now() - lastActivityRef.current) < ACTIVE_WINDOW_DURATION;
      const delay = isUserActive ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;

      timerRef.current = setTimeout(() => {
        if (aborted) return;
        void fetchStats().then(scheduleNext);
      }, delay);
    };

    // Initial fetch, then start the polling chain
    void fetchStats().then(scheduleNext);

    return () => {
      aborted = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchStats, enabled]);

  // Activity boosting via event bus subscriptions
  useEffect(() => {
    if (!enabled) return;

    // Boost activity timestamp on file changes (doesn't trigger immediate fetch)
    const boost = () => {
      lastActivityRef.current = Date.now();
    };

    // On manual refresh, boost activity AND fetch immediately
    const handleRefresh = () => {
      boost();
      void fetchStats();
    };

    const unsubWatcher = events.on('watcher:change', boost);
    const unsubRefresh = events.on('sys:refresh', handleRefresh);

    return () => {
      unsubWatcher();
      unsubRefresh();
    };
  }, [enabled, fetchStats]);

  return stats;
}
