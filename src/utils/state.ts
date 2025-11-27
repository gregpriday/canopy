import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { getWorktrees, getCurrentWorktree } from './worktree.js';
import type { CanopyConfig, Worktree } from '../types/index.js';
import { logWarn, logInfo } from './logger.js';

/**
 * Initial application state loaded on startup
 */
export interface InitialState {
  worktree: Worktree | null;
  lastCopyProfile: string;
}

/**
 * Per-worktree session state persisted between runs
 */
export interface SessionState {
  timestamp: number;
  lastCopyProfile?: string;
}

/**
 * Load initial application state on startup.
 * Detects current worktree and restores previous session if available.
 *
 * @param cwd - Current working directory
 * @param _config - Loaded configuration (unused, kept for API compatibility)
 * @returns Initial state for the application
 */
export async function loadInitialState(
  cwd: string,
  _config: CanopyConfig
): Promise<InitialState> {
  // 1. Detect current worktree
  let currentWorktree: Worktree | null = null;
  try {
    const worktrees = await getWorktrees(cwd);
    currentWorktree = getCurrentWorktree(cwd, worktrees);
  } catch (error) {
    // Not a git repo or git not available - that's OK
    logWarn('Could not detect worktree', { message: (error as Error).message });
  }

  // 2. Try to load previous session state for this worktree
  let sessionState: SessionState | null = null;
  if (currentWorktree) {
    try {
      sessionState = await loadSessionState(currentWorktree.id);
    } catch (error) {
      // Session loading failed - that's OK, we'll use defaults
      logWarn('Could not load session state', { message: (error as Error).message });
    }
  }

  // 3. Calculate initial state
  let lastCopyProfile = 'default';

  if (sessionState?.lastCopyProfile && typeof sessionState.lastCopyProfile === 'string') {
    lastCopyProfile = sessionState.lastCopyProfile;
  }

  return {
    worktree: currentWorktree,
    lastCopyProfile,
  };
}

/**
 * Load session state for a specific worktree.
 *
 * @param worktreeId - Worktree identifier
 * @returns Session state or null if not found
 */
export async function loadSessionState(
  worktreeId: string
): Promise<SessionState | null> {
  const sessionPath = getSessionPath(worktreeId);

  try {
    const exists = await fs.pathExists(sessionPath);
    if (!exists) {
      return null;
    }

    const content = await fs.readFile(sessionPath, 'utf-8');
    const raw = JSON.parse(content);

    if (!raw || typeof raw !== 'object') {
      logWarn('Invalid session state format, ignoring');
      return null;
    }

    const timestampValid =
      typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp);

    const lastCopyProfileValid =
      !Object.prototype.hasOwnProperty.call(raw, 'lastCopyProfile') ||
      typeof raw.lastCopyProfile === 'string';

    if (!timestampValid || !lastCopyProfileValid) {
      logWarn('Invalid session state format, ignoring');
      return null;
    }

    // Build session state (ignores legacy fields like selectedPath, expandedFolders, gitOnlyMode)
    const data: SessionState = {
      timestamp: raw.timestamp,
      lastCopyProfile: raw.lastCopyProfile,
    };

    // Ignore stale sessions (> 30 days old)
    const ageMs = Date.now() - data.timestamp;
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    if (ageMs > maxAgeMs) {
      logInfo('Session state is stale, ignoring');
      return null;
    }

    return data;
  } catch (error) {
    // JSON parse error, permission error, etc.
    logWarn('Failed to load session state', { message: (error as Error).message });
    return null;
  }
}

/**
 * Save session state for a specific worktree.
 *
 * @param worktreeId - Worktree identifier
 * @param state - Session state to save
 */
export async function saveSessionState(
  worktreeId: string,
  state: SessionState
): Promise<void> {
  const sessionPath = getSessionPath(worktreeId);
  const sessionDir = path.dirname(sessionPath);
  const tempSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempPath = `${sessionPath}.tmp-${tempSuffix}`;

  try {
    // Ensure sessions directory exists
    await fs.ensureDir(sessionDir);

    // Write atomically with a unique temp file to avoid cross-test races
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    await fs.move(tempPath, sessionPath, { overwrite: true });
  } catch (error) {
    // Non-fatal error - just log it
    logWarn('Failed to save session state', { message: (error as Error).message });
  } finally {
    // Clean up stray temp files if move failed midway
    try {
      await fs.remove(tempPath);
    } catch {
      // ignore
    }
  }
}

/**
 * Get the path to the session file for a worktree.
 *
 * @param worktreeId - Worktree identifier
 * @returns Absolute path to session file
 */
function getSessionPath(worktreeId: string): string {
  // Respect XDG_CONFIG_HOME on Linux
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const sessionsDir = path.join(configHome, 'canopy', 'sessions');

  // Sanitize worktree ID for use as filename
  const filename = sanitizeFilename(worktreeId) + '.json';

  return path.join(sessionsDir, filename);
}

/**
 * Sanitize a worktree ID for use as a filename.
 *
 * @param id - Worktree ID (typically a normalized path)
 * @returns Safe filename
 */
function sanitizeFilename(id: string): string {
  // Replace path separators and other problematic characters
  return id
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .toLowerCase();
}
