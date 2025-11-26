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
 * Clean up canopy note files from worktrees on startup.
 *
 * Cleanup rules:
 * 1. Main worktree note (.git/canopy/note): ALWAYS deleted on startup
 *    - The main branch is persistent, not transient like feature worktrees
 *    - Stale notes from previous sessions should not persist
 * 2. Linked worktree notes (.git/worktrees/<name>/canopy/note): Deleted if > 24 hours old
 *    - Feature worktrees are transient; notes may still be relevant
 *
 * Also cleans up empty canopy directories after deleting notes.
 *
 * This should be called once on app startup, not in the hot monitoring path.
 */
export async function cleanupStaleNotes(cwd: string): Promise<void> {
  const gitDir = getMainGitDir(cwd);
  if (!gitDir) {
    logDebug('Not a git repository, skipping note cleanup');
    return;
  }

  let deletedCount = 0;
  const now = Date.now();

  // 1. ALWAYS delete main worktree note on startup
  // The main branch is persistent, so leftover notes from previous sessions
  // should not linger. Clean slate on each Canopy launch.
  const mainNotePath = pathJoin(gitDir, NOTE_PATH);
  try {
    await unlink(mainNotePath);
    deletedCount++;
    logDebug('Deleted main worktree note on startup', { path: mainNotePath });
    await tryRemoveEmptyCanopyDir(mainNotePath);
  } catch {
    // File does not exist - that is fine
  }

  // 2. Check linked worktree notes (.git/worktrees/*/canopy/note)
  // These are deleted only if older than 24 hours
  const worktreesDir = pathJoin(gitDir, 'worktrees');
  try {
    const entries = await readdir(worktreesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const notePath = pathJoin(worktreesDir, entry.name, NOTE_PATH);
        try {
          const fileStat = await stat(notePath);
          const age = now - fileStat.mtimeMs;

          if (age > NOTE_GC_AGE_MS) {
            await unlink(notePath);
            deletedCount++;
            logDebug('Deleted stale worktree note', {
              path: notePath,
              ageHours: (age / (60 * 60 * 1000)).toFixed(1),
            });
            await tryRemoveEmptyCanopyDir(notePath);
          }
        } catch {
          // File does not exist or cannot be accessed - skip
        }
      }
    }
  } catch {
    // No worktrees directory - that is fine
  }

  if (deletedCount > 0) {
    logInfo('Cleaned up canopy note files', { count: deletedCount });
  }
}
