import { useState, useEffect, useCallback, useRef } from 'react';
import { getCommitCount } from '../utils/git.js';
import { getIssueCount, getPrCount, checkGitHubCli } from '../utils/github.js';
import { events } from '../services/events.js';

export interface RepositoryStats {
  commitCount: number;
  issueCount: number | null; // null means GitHub CLI unavailable/error
  prCount: number | null;
  loading: boolean;
}

// Polling configuration
const IDLE_POLL_INTERVAL = 5 * 60 * 1000;     // 5 minutes when idle
const ACTIVE_POLL_INTERVAL = 30 * 1000;        // 30 seconds when active
const ACTIVE_WINDOW_DURATION = 2 * 60 * 1000;  // Stay "active" for 2 mins after last event

/**
 * Hook to fetch and poll repository stats (commit count, issue count, PR count).
 * Uses adaptive polling that responds to user activity:
 * - Active mode (30s): Triggered by file changes or manual refresh
 * - Idle mode (5min): When no activity for 2 minutes
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

  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);
  const isMountedRef = useRef(true);
  const pendingRefreshRef = useRef(false);

  // Setup polling loop with variable interval
  useEffect(() => {
    if (!enabled) return;

    isMountedRef.current = true;

    const fetchStats = async () => {
      if (isFetchingRef.current || !enabled || !isMountedRef.current) return;
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

        // Only update state if still mounted
        if (isMountedRef.current) {
          setStats({
            commitCount: commits,
            issueCount: issues,
            prCount: prs,
            loading: false
          });
        }
      } catch (error) {
        // Fail silently for stats - don't disrupt the UI
        if (isMountedRef.current) {
          setStats(s => ({ ...s, loading: false }));
        }
      } finally {
        isFetchingRef.current = false;

        // Handle pending refresh request that came in during fetch
        if (pendingRefreshRef.current && isMountedRef.current) {
          pendingRefreshRef.current = false;
          void fetchStats();
        }
      }
    };

    const scheduleNext = () => {
      // Don't schedule if unmounted
      if (!isMountedRef.current) return;

      const now = Date.now();
      const timeSinceActivity = now - lastActivityRef.current;
      const isUserActive = timeSinceActivity < ACTIVE_WINDOW_DURATION;

      const delay = isUserActive ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;

      timerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          void fetchStats().then(scheduleNext);
        }
      }, delay);
    };

    const boostActivity = () => {
      lastActivityRef.current = Date.now();
      // If we were deep in idle sleep, let the current timer play out
      // to avoid spamming on every keystroke save
    };

    const handleRefresh = () => {
      lastActivityRef.current = Date.now(); // Reset activity timer

      // If currently fetching, mark that a refresh is pending
      if (isFetchingRef.current) {
        pendingRefreshRef.current = true;
      } else {
        void fetchStats(); // Force immediate fetch
      }
    };

    // Subscribe to events
    const unsubscribeWatcher = events.on('watcher:change', boostActivity);
    const unsubscribeRefresh = events.on('sys:refresh', handleRefresh);

    // Initial fetch
    void fetchStats().then(scheduleNext);

    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      unsubscribeWatcher();
      unsubscribeRefresh();
    };
  }, [cwd, enabled]);

  return stats;
}
