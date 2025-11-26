import { readdir, stat, unlink, rmdir } from 'fs/promises';
import { join as pathJoin, dirname } from 'path';
import { execSync } from 'child_process';
import { logInfo, logDebug } from './logger.js';

// Notes older than 24 hours are deleted for disk hygiene
const NOTE_GC_AGE_MS = 24 * 60 * 60 * 1000;

// Default note path within git directory (matches WorktreeMonitor)
// Stored as .git/canopy/note (namespaced for future expansion)
const NOTE_PATH = 'canopy/note';

/**
 * Get the main .git directory for a repository.
 * This is the root git directory, not a worktree-specific one.
 */
function getMainGitDir(cwd: string): string | null {
  try {
    // Get the common git directory (shared across all worktrees)
    const result = execSync('git rev-parse --git-common-dir', {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // If relative path, resolve it relative to cwd
    if (!result.startsWith('/')) {
      return pathJoin(cwd, result);
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Try to remove the canopy directory if it is empty.
 * This is a cleanup operation that runs after deleting a note file.
 */
async function tryRemoveEmptyCanopyDir(notePath: string): Promise<void> {
  try {
    const canopyDir = dirname(notePath);
    await rmdir(canopyDir); // Only succeeds if directory is empty
    logDebug('Removed empty canopy directory', { path: canopyDir });
  } catch {
    // Directory not empty or does not exist - that is fine
  }
}

/**
 * Clean up stale canopy note files from all worktrees.
 * This is a startup hygiene routine that removes notes older than 24 hours.
 *
 * Scans:
 * 1. The main .git/canopy/note (for the main worktree note)
 * 2. .git/worktrees/star/canopy/note (for linked worktree notes)
 *
 * Also cleans up empty canopy directories after deleting stale notes.
 *
 * This should be called once on app startup, not in the hot monitoring path.
 */
export async function cleanupStaleNotes(cwd: string): Promise<void> {
  const gitDir = getMainGitDir(cwd);
  if (!gitDir) {
    logDebug('Not a git repository, skipping note cleanup');
    return;
  }

  const notesToCheck: string[] = [];

  // 1. Check main .git/canopy/note (main worktree note)
  notesToCheck.push(pathJoin(gitDir, NOTE_PATH));

  // 2. Check .git/worktrees/star/canopy/note (linked worktree notes)
  const worktreesDir = pathJoin(gitDir, 'worktrees');
  try {
    const entries = await readdir(worktreesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        notesToCheck.push(pathJoin(worktreesDir, entry.name, NOTE_PATH));
      }
    }
  } catch {
    // No worktrees directory - that is fine
  }

  // 3. Check each note file and delete if stale
  let deletedCount = 0;
  const now = Date.now();

  for (const notePath of notesToCheck) {
    try {
      const fileStat = await stat(notePath);
      const age = now - fileStat.mtimeMs;

      if (age > NOTE_GC_AGE_MS) {
        await unlink(notePath);
        deletedCount++;
        logDebug('Deleted stale canopy note', {
          path: notePath,
          ageHours: (age / (60 * 60 * 1000)).toFixed(1),
        });

        // Try to remove the empty canopy directory
        await tryRemoveEmptyCanopyDir(notePath);
      }
    } catch {
      // File does not exist or cannot be accessed - skip
    }
  }

  if (deletedCount > 0) {
    logInfo('Cleaned up stale canopy note files', { count: deletedCount });
  }
}
