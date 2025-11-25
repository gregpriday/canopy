import { useState, useEffect } from 'react';
import { getCommitCount } from '../utils/git.js';
import { getIssueCount, getPrCount, checkGitHubCli } from '../utils/github.js';

export interface RepositoryStats {
  commitCount: number;
  issueCount: number | null; // null means GitHub CLI unavailable/error
  prCount: number | null;
  loading: boolean;
}

/**
 * Hook to fetch and poll repository stats (commit count, issue count, PR count).
 * Polls every 60 seconds to keep stats fresh without overwhelming the system.
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

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;

    const fetchStats = async () => {
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

        if (isMounted) {
          setStats({
            commitCount: commits,
            issueCount: issues,
            prCount: prs,
            loading: false
          });
        }
      } catch (error) {
        // Fail silently for stats - don't disrupt the UI
        if (isMounted) {
          setStats(s => ({ ...s, loading: false }));
        }
      }
    };

    // Initial fetch
    fetchStats();

    // Poll every 60 seconds
    const interval = setInterval(fetchStats, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cwd, enabled]);

  return stats;
}
