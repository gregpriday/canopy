import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';
import type { Worktree } from '../types/index.js';

/**
 * Get all git worktrees for the repository containing cwd.
 * Returns empty array if not a git repository or no worktrees.
 *
 * Uses `git worktree list --porcelain` which provides stable, machine-readable output.
 *
 * @param cwd - Current working directory (must be inside a git repository)
 * @returns Array of Worktree objects, empty if not a git repo
 *
 * @example
 * const worktrees = await getWorktrees('/Users/dev/project');
 * // [
 * //   { id: '/Users/dev/project', path: '/Users/dev/project',
 * //     name: 'main', branch: 'main', isCurrent: false },
 * //   { id: '/Users/dev/project-feature', path: '/Users/dev/project-feature',
 * //     name: 'feature', branch: 'feature/auth', isCurrent: false }
 * // ]
 */
export async function getWorktrees(cwd: string): Promise<Worktree[]> {
  try {
    const git: SimpleGit = simpleGit(cwd);

    // Check if this is a git repository first
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return [];
    }

    // Run git worktree list with porcelain format for stable parsing
    const result = await git.raw(['worktree', 'list', '--porcelain']);

    return parseWorktreeList(result);
  } catch (error) {
    // Git not installed or worktree command failed
    // Only catch expected git errors - let programmer errors surface
    if (error instanceof Error && (
      error.message.includes('git') ||
      error.message.includes('not found') ||
      error.message.includes('command not found')
    )) {
      return [];
    }
    // Re-throw unexpected errors for debugging
    throw error;
  }
}

/**
 * Identify which worktree contains the given cwd path.
 * Matches by checking if cwd starts with any worktree path.
 * Returns a copy of the matched worktree with isCurrent set to true.
 *
 * @param cwd - Current working directory to match
 * @param worktrees - Array of worktrees to search
 * @returns Matched worktree with isCurrent=true, or null if no match
 *
 * @example
 * const current = getCurrentWorktree('/Users/dev/project/src', worktrees);
 * // Returns worktree with path '/Users/dev/project' and isCurrent: true
 */
export function getCurrentWorktree(
  cwd: string,
  worktrees: Worktree[]
): Worktree | null {
  const normalizedCwd = normalizeWorktreePath(cwd);

  // Find worktree that contains this cwd
  // Important: Check longest paths first to handle nested worktrees correctly
  const sorted = [...worktrees].sort((a, b) => b.path.length - a.path.length);

  for (const wt of sorted) {
    const normalizedWtPath = normalizeWorktreePath(wt.path);

    // Check if cwd is within this worktree
    if (normalizedCwd === normalizedWtPath || normalizedCwd.startsWith(normalizedWtPath + path.sep)) {
      return { ...wt, isCurrent: true };
    }
  }

  return null;
}

/**
 * Parse output of `git worktree list --porcelain` into Worktree array.
 *
 * Porcelain format structure:
 * ```
 * worktree /absolute/path/to/worktree
 * HEAD <commit-sha>
 * branch refs/heads/branch-name
 *
 * worktree /absolute/path/to/another
 * HEAD <commit-sha>
 * detached
 * ```
 *
 * @param output - Raw output from git worktree list --porcelain
 * @returns Array of parsed Worktree objects
 */
function parseWorktreeList(output: string): Worktree[] {
  const worktrees: Worktree[] = [];
  const lines = output.trim().split(/\r?\n/);

  let current: Partial<Worktree> = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      // Start of new worktree entry
      // Save previous worktree if exists
      if (current.path) {
        worktrees.push(finalizeWorktree(current));
      }

      // Extract path (everything after "worktree ")
      const worktreePath = line.substring(9);
      current = { path: worktreePath };

    } else if (line.startsWith('branch ')) {
      // Extract branch name (strip refs/* prefixes for friendly names)
      let branchName = line.substring(7);

      // Strip common ref prefixes to show friendly names
      if (branchName.startsWith('refs/heads/')) {
        branchName = branchName.substring(11);
      } else if (branchName.startsWith('refs/remotes/')) {
        branchName = branchName.substring(13);
      } else if (branchName.startsWith('refs/tags/')) {
        branchName = branchName.substring(10);
      }

      current.branch = branchName;

    } else if (line.startsWith('detached')) {
      // Detached HEAD state - no branch
      // current.branch remains undefined

    } else if (line.startsWith('bare')) {
      // Bare repository - rare in worktree context
      // Note: bare repos typically don't have worktrees in the traditional sense

    } else if (line.trim() === '') {
      // Empty line separates worktrees
      if (current.path) {
        worktrees.push(finalizeWorktree(current));
        current = {};
      }
    }
    // Ignore other lines (HEAD, locked, prunable, etc.)
  }

  // Finalize last worktree if exists
  if (current.path) {
    worktrees.push(finalizeWorktree(current));
  }

  return worktrees;
}

/**
 * Convert partial worktree data into complete Worktree object.
 * Generates ID, name, and sets default values.
 *
 * @param partial - Partial worktree data from parsing
 * @returns Complete Worktree object
 */
function finalizeWorktree(partial: Partial<Worktree>): Worktree {
  if (!partial.path) {
    throw new Error('Worktree path is required');
  }

  const worktreePath = partial.path;

  // Generate stable ID from normalized absolute path
  const id = normalizeWorktreePath(worktreePath);

  // Generate human-readable name
  // Prefer branch name, fall back to directory name
  const name = partial.branch || path.basename(worktreePath);

  return {
    id,
    path: worktreePath,
    name,
    branch: partial.branch,
    isCurrent: false, // Will be set by getCurrentWorktree()
  };
}

/**
 * Normalize a worktree path for consistent comparison.
 * Handles platform differences (Windows vs Unix paths) and resolves symlinks.
 *
 * @param worktreePath - Path to normalize
 * @returns Normalized absolute path with symlinks resolved
 */
function normalizeWorktreePath(worktreePath: string): string {
  try {
    // Resolve symlinks and normalize path (e.g., /var -> /private/var on macOS)
    return path.normalize(fs.realpathSync(worktreePath));
  } catch (error) {
    // If path doesn't exist yet, fall back to basic normalization
    return path.normalize(path.resolve(worktreePath));
  }
}
