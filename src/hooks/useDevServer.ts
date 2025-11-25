import { useCallback, useEffect, useState } from 'react';
import { events } from '../services/events.js';
import { devServerManager } from '../services/server/index.js';
import type { DevServerState } from '../types/index.js';

export interface UseDevServerResult {
  /** Current server state */
  state: DevServerState;
  /** Start the dev server */
  start: () => Promise<void>;
  /** Stop the dev server */
  stop: () => Promise<void>;
  /** Toggle server state (start if stopped, stop if running) */
  toggle: () => Promise<void>;
  /** Whether a dev script was detected for this worktree */
  hasDevScript: boolean;
  /** Server logs */
  logs: string[];
}

/**
 * Hook to manage dev server state for a specific worktree.
 *
 * @param worktreeId - Worktree ID
 * @param worktreePath - Path to the worktree
 * @param customCommand - Optional custom command override
 */
export function useDevServer(
  worktreeId: string,
  worktreePath: string,
  customCommand?: string
): UseDevServerResult {
  const [state, setState] = useState<DevServerState>(() =>
    devServerManager.getState(worktreeId)
  );

  const [hasDevScript, setHasDevScript] = useState<boolean>(() =>
    customCommand ? true : devServerManager.hasDevScript(worktreePath)
  );

  // Subscribe to server updates
  useEffect(() => {
    // Get initial state
    setState(devServerManager.getState(worktreeId));

    // Check for dev script
    setHasDevScript(customCommand ? true : devServerManager.hasDevScript(worktreePath));

    // Subscribe to updates for this worktree
    const unsubscribe = events.on('server:update', (newState) => {
      if (newState.worktreeId === worktreeId) {
        setState(newState);
      }
    });

    return unsubscribe;
  }, [worktreeId, worktreePath, customCommand]);

  const start = useCallback(async () => {
    await devServerManager.start(worktreeId, worktreePath, customCommand);
  }, [worktreeId, worktreePath, customCommand]);

  const stop = useCallback(async () => {
    await devServerManager.stop(worktreeId);
  }, [worktreeId]);

  const toggle = useCallback(async () => {
    await devServerManager.toggle(worktreeId, worktreePath, customCommand);
  }, [worktreeId, worktreePath, customCommand]);

  const logs = devServerManager.getLogs(worktreeId);

  return {
    state,
    start,
    stop,
    toggle,
    hasDevScript,
    logs,
  };
}
