import { resolve } from 'path';
import { realpathSync } from 'fs';
import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import type { GitStatus } from '../types/index.js';
import { GitError } from './errorTypes.js';
import { logWarn, logError } from './logger.js';
import { Cache } from './cache.js';
import { perfMonitor } from './perfMetrics.js';

/**
 * Check if a directory is inside a git repository.
 *
 * @param path - Directory path to check
 * @returns true if path is in a git repo, false otherwise
 */
export async function isGitRepository(path: string): Promise<boolean> {
  try {
    const git: SimpleGit = simpleGit(path);
    const isRepo = await git.checkIsRepo();
    return isRepo;
  } catch (error) {
    // Git not installed or other error - this is expected, not an error
    logWarn('Git repository check failed', { path, error: (error as Error).message });
    return false;
  }
}

/**
 * Get git status for all files in a repository.
 * Returns a map of absolute file path to git status.
 * Clean files (unmodified, tracked) are NOT included in the map.
 *
 * @param cwd - Working directory (should be inside a git repo)
 * @returns Map of absolute file paths to GitStatus
 */
export async function getGitStatus(cwd: string): Promise<Map<string, GitStatus>> {
  const statusMap = new Map<string, GitStatus>();

  try {
    const git: SimpleGit = simpleGit(cwd);
    const status: StatusResult = await git.status();

    // Get the git root directory to resolve paths correctly
    // Git status paths are relative to the repository root, not the cwd
    const gitRoot = realpathSync((await git.revparse(['--show-toplevel'])).trim());

    // Helper to resolve relative paths from git to absolute paths
    const resolvePath = (relativePath: string): string => {
      return resolve(gitRoot, relativePath);
    };

    // Modified files (staged or unstaged)
    for (const file of status.modified) {
      statusMap.set(resolvePath(file), 'modified');
    }

    // Renamed files: mark old path as deleted, new path as added
    // Note: if a renamed file also has modifications, status.modified already contains it
    // Don't overwrite 'modified' status with 'added'
    for (const file of status.renamed) {
      // Renamed files have 'from' and 'to' properties
      if (typeof file !== 'string') {
        statusMap.set(resolvePath(file.from), 'deleted');
        // Only set 'added' if the new path isn't already marked as modified
        const newPath = resolvePath(file.to);
        if (!statusMap.has(newPath)) {
          statusMap.set(newPath, 'added');
        }
      }
    }

    // Created/added files (staged)
    for (const file of status.created) {
      statusMap.set(resolvePath(file), 'added');
    }

    // Deleted files
    for (const file of status.deleted) {
      statusMap.set(resolvePath(file), 'deleted');
    }

    // Untracked files (not staged, not in .gitignore)
    for (const file of status.not_added) {
      statusMap.set(resolvePath(file), 'untracked');
    }

    // Conflicted files (treat as modified)
    if (status.conflicted) {
      for (const file of status.conflicted) {
        statusMap.set(resolvePath(file), 'modified');
      }
    }

    // Note: 'ignored' status is not populated because:
    // - git status doesn't report ignored files by default
    // - Would require running git check-ignore on every file (expensive)
    // - Can be added in a future enhancement if needed

  } catch (error) {
    // Normalize error cause to always be an Error instance
    const cause = error instanceof Error ? error : new Error(String(error));

    // Git operation failed - wrap in GitError for better context
    const gitError = new GitError(
      'Failed to get git status',
      { cwd },
      cause
    );

    // Log before throwing so failures appear in structured logs
    logError('Git status operation failed', gitError, { cwd });

    throw gitError;
  }

  return statusMap;
}

// Git status cache configuration
const GIT_STATUS_CACHE = new Cache<string, Map<string, GitStatus>>({
	maxSize: 100, // Cache up to 100 different directories
	defaultTTL: 5000, // 5 second TTL
});

// Periodically clean up expired entries
const cleanupInterval = setInterval(() => GIT_STATUS_CACHE.cleanup(), 10000); // Every 10 seconds

// Allow cleanup to be stopped (for testing)
export function stopGitStatusCacheCleanup(): void {
	clearInterval(cleanupInterval);
}

/**
 * Get git status with caching.
 * Results are cached for 5 seconds to reduce git command overhead.
 *
 * @param cwd - Working directory
 * @param forceRefresh - Skip cache and force fresh git status
 * @returns Map of file paths to git status
 */
export async function getGitStatusCached(
	cwd: string,
	forceRefresh = false,
): Promise<Map<string, GitStatus>> {
	// Check cache first (unless forced refresh)
	if (!forceRefresh) {
		const cached = GIT_STATUS_CACHE.get(cwd);
		if (cached) {
			perfMonitor.recordMetric('git-status-cache-hit', 1);
			// Return a new Map instance to ensure React detects changes via reference equality
			return new Map(cached);
		}
	}

	perfMonitor.recordMetric('git-status-cache-miss', 1);

	// Cache miss or forced refresh - call original function with metrics
	const status = await perfMonitor.measure('git-status-fetch', () =>
		getGitStatus(cwd),
	);

	// Store in cache
	GIT_STATUS_CACHE.set(cwd, status);

	return status;
}

/**
 * Invalidate git status cache for a directory.
 * Call this when you know git status has changed.
 *
 * @param cwd - Directory to invalidate
 */
export function invalidateGitStatusCache(cwd: string): void {
	GIT_STATUS_CACHE.invalidate(cwd);
}

/**
 * Clear all git status caches.
 * Useful when switching worktrees.
 */
export function clearGitStatusCache(): void {
	GIT_STATUS_CACHE.clear();
}
