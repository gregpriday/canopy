import { useState, useEffect, useRef, useCallback } from 'react';
import { loadConfig } from '../utils/config.js';
import { getWorktrees, getCurrentWorktree } from '../utils/worktree.js';
import { loadInitialState } from '../utils/state.js';
import { logDebug, logWarn, logError } from '../utils/logger.js';
import { events } from '../services/events.js';
import type { CanopyConfig, Worktree, Notification, NotificationPayload } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/index.js';

// Ensure we only update worktrees state when the underlying list actually changes
const areWorktreesEqual = (a: Worktree[], b: Worktree[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  const mapA = new Map(a.map(wt => [wt.id, wt]));

  for (const wt of b) {
    const match = mapA.get(wt.id);
    if (!match) {
      return false;
    }

    if (
      match.path !== wt.path ||
      match.name !== wt.name ||
      match.branch !== wt.branch
    ) {
      return false;
    }
  }

  return true;
};

export type LifecycleStatus = 'idle' | 'initializing' | 'ready' | 'error';

export interface LifecycleState {
  status: LifecycleStatus;
  config: CanopyConfig;
  worktrees: Worktree[];
  activeWorktreeId: string | null;
  activeRootPath: string;
  initialSelectedPath: string | null;
  initialExpandedFolders: Set<string>;
  initialGitOnlyMode: boolean;
  initialCopyProfile: string;
  error: Error | null;
}

export interface UseAppLifecycleOptions {
  cwd: string;
  initialConfig?: CanopyConfig;
  noWatch?: boolean;
  noGit?: boolean;
}

export interface UseAppLifecycleReturn extends LifecycleState {
  notification: Notification | null;
  setNotification: (notification: Notification | null) => void;
  reinitialize: () => Promise<void>;
}

/**
 * Centralized application lifecycle management hook.
 * Orchestrates:
 * - Configuration loading (if not provided)
 * - Worktree discovery
 * - Initial state loading (selected path, expanded folders)
 * - Initial path determination
 * - Error handling and recovery
 *
 * Note: File watching and git status are handled separately by their
 * respective hooks (useFileTree, useGitStatus) which react to activeRootPath changes.
 */
export function useAppLifecycle({
  cwd,
  initialConfig,
  noWatch,
  noGit,
}: UseAppLifecycleOptions): UseAppLifecycleReturn {
  const [state, setState] = useState<LifecycleState>({
    status: 'initializing',
    config: initialConfig || DEFAULT_CONFIG,
    worktrees: [],
    activeWorktreeId: null,
    activeRootPath: cwd,
    initialSelectedPath: null,
    initialExpandedFolders: new Set<string>(),
    initialGitOnlyMode: false,
    initialCopyProfile: 'default',
    error: null,
  });

  const [notification, setNotification] = useState<Notification | null>(null);
  const isMountedRef = useRef(true);
  const initializingRef = useRef(false);
  const createNotification = (payload: NotificationPayload): Notification => ({
    id: payload.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    message: payload.message,
    type: payload.type,
  });

  const initialize = useCallback(async () => {
    // Prevent concurrent initializations
    if (initializingRef.current) {
      return;
    }

    initializingRef.current = true;

    try {
      // Set status to initializing
      if (isMountedRef.current) {
        setState(prev => ({ ...prev, status: 'initializing', error: null }));
      }

      // Step 1: Detect worktrees BEFORE loading config (for worktree-aware config loading)
      let worktrees: Worktree[] = [];
      let currentWorktree: Worktree | null = null;

      if (!noGit) {
        try {
          worktrees = await getWorktrees(cwd);
          if (!isMountedRef.current) return;

          currentWorktree = getCurrentWorktree(cwd, worktrees);
        } catch (error) {
          // Not a git repo or git not available - that's OK
          logDebug('Could not detect worktrees:', { error });
        }
      }

      // Step 2: Load configuration if not provided
      // Pass worktree information for worktree-aware config loading
      let config = initialConfig;
      if (!initialConfig) {
        try {
          config = await loadConfig(cwd, currentWorktree, worktrees);
          if (!isMountedRef.current) return;
        } catch (error) {
          logWarn('Failed to load config, using defaults:', { error });
          if (isMountedRef.current) {
            setNotification(createNotification({
              type: 'warning',
              message: `Config error: ${(error as Error).message}. Using defaults.`,
            }));
          }
          config = DEFAULT_CONFIG;
        }
      }

      // Step 3: Check if worktrees should be enabled
      const worktreesEnabled = !noGit && (config!.worktrees?.enable ?? true);

      // Step 4: Load initial state (always load when git available for session persistence)
      let activeWorktreeId: string | null = null;
      let activeRootPath = cwd;
      let initialSelectedPath: string | null = null;
      let initialExpandedFolders = new Set<string>();
      let initialGitOnlyMode = false;
      let initialCopyProfile = 'default';

      if (noGit) {
        // Git completely disabled - skip all git operations
        logDebug('Git disabled (--no-git flag)');
      } else {
        try {
          // Load initial state which detects worktree and restores session
          const initialState = await loadInitialState(cwd, config!);
          if (!isMountedRef.current) return;

          // Extract worktree information only if worktrees are enabled
          if (worktreesEnabled && initialState.worktree) {
            activeWorktreeId = initialState.worktree.id;
            activeRootPath = initialState.worktree.path;

            // Update currentWorktree to match the one from initial state
            currentWorktree = initialState.worktree;
          }

          // Always store initial state for session restoration
          initialSelectedPath = initialState.selectedPath;
          initialExpandedFolders = initialState.expandedFolders;
          initialGitOnlyMode = initialState.gitOnlyMode;
          initialCopyProfile = initialState.lastCopyProfile;
        } catch (error) {
          // Check if this is a truly catastrophic error (not just "not a git repo")
          const errorMessage = (error as Error).message;
          if (errorMessage && errorMessage.includes('Catastrophic')) {
            // Re-throw catastrophic errors - they should fail initialization
            throw error;
          }
          // State loading is optional - not being in a git repo is OK
          logDebug('Could not load initial state:', { error });
          if (!isMountedRef.current) return;
        }
      }

      // Step 5: Filter worktrees list if worktrees are disabled
      if (!worktreesEnabled) {
        worktrees = [];
      }

      // Step 3: Update state to ready
      if (isMountedRef.current) {
        setState({
          status: 'ready',
          config: config!,
          worktrees,
          activeWorktreeId,
          activeRootPath,
          initialSelectedPath,
          initialExpandedFolders,
          initialGitOnlyMode,
          initialCopyProfile,
          error: null,
        });
      }
    } catch (error) {
      // Catch any unexpected errors
      logError('Lifecycle initialization failed:', error);
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: error as Error,
        }));
        setNotification(createNotification({
          type: 'error',
          message: `Initialization failed: ${(error as Error).message}`,
        }));
      }
    } finally {
      initializingRef.current = false;
    }
  }, [cwd, initialConfig]);

  // Initialize on mount
  useEffect(() => {
    isMountedRef.current = true;
    initialize();

    return () => {
      isMountedRef.current = false;
    };
  }, [initialize]);

  // Keep lifecycle-aware state in sync with explicit worktree switches
  useEffect(() => {
    if (noGit) {
      return;
    }

    return events.on('sys:worktree:switch', ({ worktreeId }) => {
      setState(prev => {
        if (prev.status !== 'ready') {
          return prev;
        }

        const matchingWorktree = prev.worktrees.find(wt => wt.id === worktreeId);
        if (!matchingWorktree) {
          return prev;
        }

        return {
          ...prev,
          activeWorktreeId: matchingWorktree.id,
          activeRootPath: matchingWorktree.path,
        };
      });
    });
  }, [noGit]);

  // Auto-refresh worktree list at the configured cadence
  useEffect(() => {
    if (state.status !== 'ready' || !state.config.worktrees?.enable || noGit) {
      return;
    }

    const intervalMs = state.config.worktrees.refreshIntervalMs ?? 0;
    if (intervalMs <= 0) {
      return;
    }

    let refreshInFlight = false;
    const intervalId = setInterval(async () => {
      if (refreshInFlight) {
        return;
      }
      refreshInFlight = true;

      try {
        const updatedWorktrees = await getWorktrees(state.activeRootPath);

        if (!isMountedRef.current || state.status !== 'ready') {
          return;
        }

        let activeStillExists = true;
        let listChanged = false;
        let fallbackWorktree: Worktree | null = null;

        setState(prev => {
          if (prev.status !== 'ready') {
            return prev;
          }

          const activeId = prev.activeWorktreeId;
          activeStillExists = activeId ? updatedWorktrees.some(wt => wt.id === activeId) : true;
          listChanged = !areWorktreesEqual(prev.worktrees, updatedWorktrees);

          if (!listChanged && activeStillExists) {
            return prev;
          }

          if (!activeStillExists && updatedWorktrees.length > 0) {
            fallbackWorktree = updatedWorktrees[0];
          }

          const nextState = {
            ...prev,
            worktrees: updatedWorktrees,
          };

          if (!activeStillExists && updatedWorktrees.length === 0) {
            return {
              ...nextState,
              activeWorktreeId: null,
            };
          }

          return nextState;
        });

        if (!listChanged && activeStillExists) {
          return;
        }

        if (!activeStillExists) {
          if (fallbackWorktree) {
            events.emit('sys:worktree:switch', { worktreeId: fallbackWorktree.id });
            events.emit('ui:notify', {
              type: 'warning',
              message: `Active worktree was deleted. Switching to ${fallbackWorktree.branch || fallbackWorktree.name}`,
            });
          } else {
            events.emit('ui:notify', {
              type: 'warning',
              message: 'Active worktree was deleted and no other worktrees remain',
            });
          }
        }
      } catch (error) {
        logDebug('Worktree auto-refresh failed', { error });
      } finally {
        refreshInFlight = false;
      }
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [
    state.status,
    state.config.worktrees?.enable,
    state.config.worktrees?.refreshIntervalMs,
    state.activeRootPath,
    state.activeWorktreeId,
    noGit,
  ]);

  // Manual refresh triggered via sys:worktree:refresh
  useEffect(() => {
    if (state.status !== 'ready' || !state.config.worktrees?.enable || noGit) {
      return;
    }

    return events.on('sys:worktree:refresh', async () => {
      try {
        const updatedWorktrees = await getWorktrees(state.activeRootPath);

        if (!isMountedRef.current || state.status !== 'ready') {
          return;
        }

        setState(prev => {
          if (prev.status !== 'ready') {
            return prev;
          }

          if (areWorktreesEqual(prev.worktrees, updatedWorktrees)) {
            return prev;
          }

          return {
            ...prev,
            worktrees: updatedWorktrees,
          };
        });
        events.emit('ui:notify', {
          type: 'success',
          message: 'Worktree list refreshed',
        });
      } catch (error) {
        events.emit('ui:notify', {
          type: 'error',
          message: 'Failed to refresh worktrees',
        });
      }
    });
  }, [state.status, state.config.worktrees?.enable, state.activeRootPath, noGit]);

  return {
    ...state,
    notification,
    setNotification,
    reinitialize: initialize,
  };
}
