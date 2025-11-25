import { dirname, resolve } from 'path';
import { realpathSync, promises as fs } from 'fs';
import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import type { FileChangeDetail, GitStatus, WorktreeChanges } from '../types/index.js';
import { GitError, WorktreeRemovedError } from './errorTypes.js';
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

const GIT_WORKTREE_CHANGES_CACHE = new Cache<string, WorktreeChanges>({
  maxSize: 100,
  defaultTTL: 5000,
});

// Periodically clean up expired entries
const cleanupInterval = setInterval(() => {
  GIT_STATUS_CACHE.cleanup();
  GIT_WORKTREE_CHANGES_CACHE.cleanup();
}, 10000); // Every 10 seconds

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
  GIT_WORKTREE_CHANGES_CACHE.invalidate(cwd);
}

/**
 * Clear all git status caches.
 * Useful when switching worktrees.
 */
export function clearGitStatusCache(): void {
  GIT_STATUS_CACHE.clear();
  GIT_WORKTREE_CHANGES_CACHE.clear();
}

interface DiffStat {
  insertions: number | null;
  deletions: number | null;
}

const NUMSTAT_PATH_SPLITTERS = ['=>', '->'];

function normalizeNumstatPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  for (const splitter of NUMSTAT_PATH_SPLITTERS) {
    const idx = trimmed.lastIndexOf(splitter);
    if (idx !== -1) {
      return trimmed
        .slice(idx + splitter.length)
        .replace(/[{}]/g, '')
        .trim();
    }
  }
  return trimmed.replace(/[{}]/g, '');
}

function parseNumstat(diffOutput: string, gitRoot: string): Map<string, DiffStat> {
  const stats = new Map<string, DiffStat>();
  const lines = diffOutput.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const [insertionsRaw, deletionsRaw, ...pathParts] = parts;
    const rawPath = pathParts.join('\t');
    const normalizedPath = normalizeNumstatPath(rawPath);
    const absolutePath = resolve(gitRoot, normalizedPath);

    const insertions =
      insertionsRaw === '-' ? null : Number.parseInt(insertionsRaw, 10);
    const deletions =
      deletionsRaw === '-' ? null : Number.parseInt(deletionsRaw, 10);

    stats.set(absolutePath, {
      insertions: Number.isNaN(insertions) ? null : insertions,
      deletions: Number.isNaN(deletions) ? null : deletions,
    });
  }

  return stats;
}

/**
 * Get total commit count for the current branch.
 * @param cwd - Working directory
 * @returns Number of commits in the current branch history
 */
export async function getCommitCount(cwd: string): Promise<number> {
  try {
    const git = simpleGit(cwd);
    // 'HEAD' counts all commits in history of current branch
    const count = await git.raw(['rev-list', '--count', 'HEAD']);
    return parseInt(count.trim(), 10);
  } catch (error) {
    logWarn('Failed to get commit count', { cwd, error: (error as Error).message });
    return 0;
  }
}

/**
 * Fetch worktree changes enriched with insertion/deletion counts.
 * Includes caching with the same TTL as basic status.
 */
export async function getWorktreeChangesWithStats(
  cwd: string,
  forceRefresh = false,
): Promise<WorktreeChanges> {
  if (!forceRefresh) {
    const cached = GIT_WORKTREE_CHANGES_CACHE.get(cwd);
    if (cached) {
      return {
        ...cached,
        changes: cached.changes.map(change => ({ ...change })),
      };
    }
  }

  // PERF: Limit the number of files we calculate stats for to prevent CPU hang
  // on massive changesets (e.g., accidental package-lock.json deletion in monorepo)
  const MAX_FILES_FOR_NUMSTAT = 100;

  // Check if directory exists before calling simpleGit.
  // simple-git throws immediately if cwd doesn't exist, which can flood stderr
  // when a worktree is deleted externally while being monitored.
  try {
    await fs.access(cwd);
  } catch (accessError) {
    const nodeError = accessError as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      throw new WorktreeRemovedError(cwd, nodeError);
    }
    // Re-throw other access errors (e.g., permissions)
    throw accessError;
  }

  try {
    const git: SimpleGit = simpleGit(cwd);
    const status: StatusResult = await git.status();
    const gitRoot = realpathSync((await git.revparse(['--show-toplevel'])).trim());

    // Collect all tracked changed files for numstat (excludes untracked)
    const trackedChangedFiles = [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map(r => r.to),
    ];

    let diffOutput = '';
    let statsLimited = false;

    try {
      if (trackedChangedFiles.length === 0) {
        // No tracked changes - skip numstat entirely
        diffOutput = '';
      } else if (trackedChangedFiles.length <= MAX_FILES_FOR_NUMSTAT) {
        // Small changeset - run numstat on all files
        diffOutput = await git.diff(['--numstat', 'HEAD']);
      } else {
        // PERF: Large changeset - only run numstat on first N files to prevent CPU hang
        // The remaining files will show stats as 0/0 but will still appear in the list
        statsLimited = true;
        const limitedFiles = trackedChangedFiles.slice(0, MAX_FILES_FOR_NUMSTAT);
        diffOutput = await git.diff(['--numstat', 'HEAD', '--', ...limitedFiles]);
        logWarn('Large changeset detected; limiting numstat to first 100 files', {
          cwd,
          totalFiles: trackedChangedFiles.length,
          limitedTo: MAX_FILES_FOR_NUMSTAT,
        });
      }
    } catch (error) {
      logWarn('Failed to read numstat diff; continuing without line stats', {
        cwd,
        message: (error as Error).message,
      });
    }

    const diffStats = parseNumstat(diffOutput, gitRoot);
    const changesMap = new Map<string, FileChangeDetail>();

    /**
     * Helper to count lines in a file by reading from filesystem.
     * Used for untracked files where git diff doesn't provide stats.
     * Counts newline characters to match git diff --numstat behavior.
     */
    const countFileLines = async (filePath: string): Promise<number | null> => {
      try {
        // Read as buffer first to detect binary files
        const buffer = await fs.readFile(filePath);

        // Check for binary content (presence of NUL bytes in first 8KB)
        const sampleSize = Math.min(buffer.length, 8192);
        for (let i = 0; i < sampleSize; i++) {
          if (buffer[i] === 0) {
            // Binary file detected - return null
            return null;
          }
        }

        // Convert to string and count newlines
        const content = buffer.toString('utf-8');

        // Empty file = 0 lines
        if (content.length === 0) {
          return 0;
        }

        // Count newline characters (matches git diff --numstat)
        let lineCount = 0;
        for (let i = 0; i < content.length; i++) {
          if (content[i] === '\n') {
            lineCount++;
          }
        }

        // If file doesn't end with newline, add 1 for the final line
        if (content[content.length - 1] !== '\n') {
          lineCount++;
        }

        return lineCount;
      } catch (error) {
        // File may be unreadable, or deleted between status check and read
        // Fall back to null to indicate we couldn't determine line count
        return null;
      }
    };

    const addChange = async (pathFragment: string, statusValue: GitStatus) => {
      const absolutePath = resolve(gitRoot, pathFragment);
      const existing = changesMap.get(absolutePath);
      if (existing) {
        return;
      }

      const statsForFile = diffStats.get(absolutePath);
      let insertions: number | null;
      let deletions: number | null;

      // For untracked files without diff stats, read from filesystem to get line count
      if (statusValue === 'untracked' && !statsForFile) {
        insertions = await countFileLines(absolutePath);
        deletions = null; // Untracked files have no deletions
      } else {
        insertions = statsForFile?.insertions ?? (statusValue === 'untracked' ? null : 0);
        deletions = statsForFile?.deletions ?? (statusValue === 'untracked' ? null : 0);
      }

      changesMap.set(absolutePath, {
        path: absolutePath,
        status: statusValue,
        insertions,
        deletions,
      });
    };

    // Process tracked files sequentially (no filesystem reads needed)
    for (const file of status.modified) {
      await addChange(file, 'modified');
    }

    for (const file of status.renamed) {
      if (typeof file !== 'string' && file.to) {
        await addChange(file.to, 'renamed');
      }
    }

    for (const file of status.created) {
      await addChange(file, 'added');
    }

    for (const file of status.deleted) {
      await addChange(file, 'deleted');
    }

    if (status.conflicted) {
      for (const file of status.conflicted) {
        await addChange(file, 'modified');
      }
    }

    // Process untracked files in parallel with bounded concurrency (max 10 at once)
    // to avoid blocking on filesystem reads while preventing memory issues
    // PERF: Also limit total untracked files processed to prevent CPU hang on massive repos
    const untrackedFiles = status.not_added;
    const MAX_UNTRACKED_FILES = 200; // Limit untracked file processing
    const concurrencyLimit = 10;

    const limitedUntrackedFiles = untrackedFiles.length > MAX_UNTRACKED_FILES
      ? untrackedFiles.slice(0, MAX_UNTRACKED_FILES)
      : untrackedFiles;

    if (untrackedFiles.length > MAX_UNTRACKED_FILES) {
      logWarn('Large number of untracked files; limiting to first 200', {
        cwd,
        totalUntracked: untrackedFiles.length,
        limitedTo: MAX_UNTRACKED_FILES,
      });
    }

    for (let i = 0; i < limitedUntrackedFiles.length; i += concurrencyLimit) {
      const batch = limitedUntrackedFiles.slice(i, i + concurrencyLimit);
      await Promise.all(batch.map(file => addChange(file, 'untracked')));
    }

    // Backfill any files that appear in diff stats but not in status
    for (const [absolutePath, stats] of diffStats.entries()) {
      if (changesMap.has(absolutePath)) continue;
      changesMap.set(absolutePath, {
        path: absolutePath,
        status: 'modified',
        insertions: stats.insertions ?? 0,
        deletions: stats.deletions ?? 0,
      });
    }

    // Calculate the latest modification time across all changed files so we can
    // throttle AI refreshes based on real file activity instead of hash churn.
    // Also store mtimeMs on each change for recency scoring in AI summaries.
    const mtimes = await Promise.all(
      Array.from(changesMap.values()).map(async (change) => {
        const targetPath = change.status === 'deleted'
          ? dirname(change.path)
          : change.path;

        try {
          const stat = await fs.stat(targetPath);
          change.mtimeMs = stat.mtimeMs; // Store mtime on the change object
          return stat.mtimeMs;
        } catch {
          change.mtimeMs = 0;
          return 0;
        }
      })
    );

    const changes = Array.from(changesMap.values());
    const totalInsertions = changes.reduce(
      (sum, change) => sum + (change.insertions ?? 0),
      0
    );
    const totalDeletions = changes.reduce(
      (sum, change) => sum + (change.deletions ?? 0),
      0
    );
    const latestFileMtime = mtimes.length > 0 ? Math.max(...mtimes) : 0;

    const result: WorktreeChanges = {
      worktreeId: realpathSync(cwd),
      rootPath: gitRoot,
      changes,
      changedFileCount: changes.length,
      totalInsertions,
      totalDeletions,
      insertions: totalInsertions,
      deletions: totalDeletions,
      latestFileMtime,
      lastUpdated: Date.now(),
    };

    GIT_WORKTREE_CHANGES_CACHE.set(cwd, result);
    return result;
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    const gitError = new GitError(
      'Failed to get git worktree changes',
      { cwd },
      cause
    );
    logError('Git worktree changes operation failed', gitError, { cwd });
    throw gitError;
  }
}
