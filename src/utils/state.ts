import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { getWorktrees, getCurrentWorktree } from './worktree.js';
import type { CanopyConfig, Worktree } from '../types/index.js';

/**
 * Initial application state loaded on startup
 */
export interface InitialState {
  worktree: Worktree | null;
  selectedPath: string | null;
  expandedFolders: Set<string>;
  cursorPosition: number;
  gitOnlyMode: boolean;
}

/**
 * Per-worktree session state persisted between runs
 */
export interface SessionState {
  selectedPath: string | null;
  expandedFolders: string[];  // Array for JSON serialization
  gitOnlyMode?: boolean;      // Git-only view mode preference
  timestamp: number;
}

/**
 * Load initial application state on startup.
 * Detects current worktree and restores previous session if available.
 *
 * @param cwd - Current working directory
 * @param config - Loaded configuration
 * @returns Initial state for the application
 */
export async function loadInitialState(
  cwd: string,
  config: CanopyConfig
): Promise<InitialState> {
  // 1. Detect current worktree
  let currentWorktree: Worktree | null = null;
  try {
    const worktrees = await getWorktrees(cwd);
    currentWorktree = getCurrentWorktree(cwd, worktrees);
  } catch (error) {
    // Not a git repo or git not available - that's OK
    console.warn('Could not detect worktree:', (error as Error).message);
  }

  // 2. Try to load previous session state for this worktree
  let sessionState: SessionState | null = null;
  if (currentWorktree) {
    try {
      sessionState = await loadSessionState(currentWorktree.id);
    } catch (error) {
      // Session loading failed - that's OK, we'll use defaults
      console.warn('Could not load session state:', (error as Error).message);
    }
  }

  // 3. Calculate initial state
  const rootPath = currentWorktree?.path || cwd;

  // Use session state if available and valid
  let selectedPath: string | null = rootPath;
  let expandedFolders = new Set<string>();
  let cursorPosition = 0;
  let gitOnlyMode = false;

  if (sessionState) {
    // Restore null selection if explicitly saved
    if (sessionState.selectedPath === null) {
      selectedPath = null;
    }
    // Validate that selected path still exists
    else if (typeof sessionState.selectedPath === 'string' && sessionState.selectedPath) {
      const pathExists = await fs.pathExists(sessionState.selectedPath);
      if (pathExists) {
        selectedPath = sessionState.selectedPath;
      }
    }

    // Restore expanded folders
    expandedFolders = new Set(sessionState.expandedFolders);

    // Restore git-only mode preference
    gitOnlyMode = sessionState.gitOnlyMode ?? false;
  }

  return {
    worktree: currentWorktree,
    selectedPath,
    expandedFolders,
    cursorPosition,
    gitOnlyMode,
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
      console.warn('Invalid session state format, ignoring');
      return null;
    }

    const hasValidSelectedPath =
      Object.prototype.hasOwnProperty.call(raw, 'selectedPath') &&
      (raw.selectedPath === null || typeof raw.selectedPath === 'string');

    const expandedFoldersValid =
      Array.isArray(raw.expandedFolders) &&
      raw.expandedFolders.every((folder: unknown) => typeof folder === 'string');

    const timestampValid =
      typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp);

    // Optional gitOnlyMode field - only validate if present
    const gitOnlyModeValid =
      !Object.prototype.hasOwnProperty.call(raw, 'gitOnlyMode') ||
      typeof raw.gitOnlyMode === 'boolean';

    if (!hasValidSelectedPath || !expandedFoldersValid || !timestampValid || !gitOnlyModeValid) {
      console.warn('Invalid session state format, ignoring');
      return null;
    }

    // Build session state
    const data: SessionState = {
      selectedPath: raw.selectedPath,
      expandedFolders: raw.expandedFolders,
      gitOnlyMode: raw.gitOnlyMode,
      timestamp: raw.timestamp,
    };

    // Ignore stale sessions (> 30 days old)
    const ageMs = Date.now() - data.timestamp;
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    if (ageMs > maxAgeMs) {
      console.log('Session state is stale, ignoring');
      return null;
    }

    return data;
  } catch (error) {
    // JSON parse error, permission error, etc.
    console.warn('Failed to load session state:', (error as Error).message);
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

  try {
    // Ensure sessions directory exists
    await fs.ensureDir(sessionDir);

    // Write atomically (temp file + rename)
    const tempPath = `${sessionPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    await fs.rename(tempPath, sessionPath);
  } catch (error) {
    // Non-fatal error - just log it
    console.warn('Failed to save session state:', (error as Error).message);
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
