import { execa } from 'execa';
import path from 'path';
import { minimatch } from 'minimatch';
import type { CanopyConfig, OpenerConfig, Worktree } from '../types/index.js';

async function launchOpener(opener: OpenerConfig, targetPath: string): Promise<void> {
  const args = [...opener.args, targetPath];

  const child = execa(opener.cmd, args, {
    detached: true,
    stdio: 'ignore',
    shell: false,
    cleanup: false,
  });

  try {
    // Wait only for spawn to succeed/fail, not for process to exit
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);  // ENOENT, EACCES, etc.
      child.once('spawn', resolve); // Process started successfully
    });

    // Process started successfully - detach it and return immediately
    child.unref();

    // Optionally swallow non-zero exit codes since we don't care about editor exit status
    child.catch(() => {});
  } catch (error) {
    // Enhance error message with helpful context
    const err = error as Error & { code?: string };
    if (err.code === 'ENOENT') {
      throw new Error(
        `Editor '${opener.cmd}' not found. Please install it or update your config.`
      );
    } else if (err.code === 'EACCES') {
      throw new Error(
        `Permission denied executing '${opener.cmd}'. Check file permissions.`
      );
    } else {
      throw new Error(
        `Failed to open with '${opener.cmd}': ${err.message}`
      );
    }
  }
}

/**
 * Open a file using the configured opener.
 * Matches file against opener patterns in order:
 * 1. byExtension - exact extension match
 * 2. byGlob - glob pattern match (first match wins)
 * 3. default - fallback opener
 *
 * @param filePath - Absolute path to file to open
 * @param config - Canopy configuration
 * @throws Error if editor command fails or is not found
 */
export async function openFile(
  filePath: string,
  config: CanopyConfig,
  overrideOpener?: OpenerConfig
): Promise<void> {
  // Find the right opener for this file
  const opener = overrideOpener ?? resolveOpener(filePath, config);

  await launchOpener(opener, filePath);
}

/**
 * Find the appropriate opener for a file based on config.
 * Checks in order: byExtension, byGlob, default.
 *
 * @param filePath - Path to file
 * @param config - Canopy configuration
 * @returns OpenerConfig to use
 */
function resolveOpener(filePath: string, config: CanopyConfig): OpenerConfig {
  const openers = config.openers;

  // Handle case where openers not configured - fall back to editor/editorArgs
  if (!openers) {
    return {
      cmd: config.editor,
      args: config.editorArgs,
    };
  }

  // 1. Check extension-based openers (case-insensitive)
  const ext = path.extname(filePath).toLowerCase();
  if (ext && openers.byExtension) {
    // Normalize extension keys to lowercase for case-insensitive matching
    const normalizedByExtension: Record<string, OpenerConfig> = {};
    for (const [key, value] of Object.entries(openers.byExtension)) {
      normalizedByExtension[key.toLowerCase()] = value;
    }

    if (normalizedByExtension[ext]) {
      return normalizedByExtension[ext];
    }
  }

  // 2. Check glob-based openers (first match wins)
  if (openers.byGlob) {
    // Use deterministic iteration order (Object.entries maintains insertion order)
    for (const [pattern, opener] of Object.entries(openers.byGlob)) {
      if (matchesGlob(filePath, pattern)) {
        return opener;
      }
    }
  }

  // 3. Fall back to default opener
  return openers.default;
}

/**
 * Check if a file path matches a glob pattern.
 * Uses minimatch for glob matching.
 *
 * @param filePath - File path to test
 * @param pattern - Glob pattern
 * @returns true if path matches pattern
 */
function matchesGlob(filePath: string, pattern: string): boolean {
  return minimatch(filePath, pattern, {
    dot: true,        // Match dotfiles
    matchBase: true,  // Match basename if no slashes in pattern
  });
}

function resolveDefaultOpener(config: CanopyConfig): OpenerConfig {
  if (config.openers?.default) {
    return config.openers.default;
  }

  return {
    cmd: config.editor,
    args: config.editorArgs,
  };
}

/**
 * Open a worktree in the configured editor (workspace/folder mode).
 *
 * @param worktree - Worktree to open
 * @param config - Canopy configuration
 */
export async function openWorktreeInEditor(
  worktree: Worktree,
  config: CanopyConfig,
  overrideOpener?: OpenerConfig
): Promise<void> {
  const opener = overrideOpener ?? resolveDefaultOpener(config);
  await launchOpener(opener, worktree.path);
}
