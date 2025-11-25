import { useState, useEffect } from 'react';
import { events } from '../services/events.js';
import type { WorktreeState } from '../services/monitor/index.js';
import type { Worktree } from '../types/index.js';

/**
 * Hook to subscribe to WorktreeMonitor updates.
 *
 * This hook listens to the global event bus for worktree state updates
 * and maintains a map of worktree states indexed by ID.
 *
 * @returns Map of worktree ID to WorktreeState
 *
 * @example
 * ```tsx
 * const worktreeStates = useWorktreeMonitor();
 * const state = worktreeStates.get(worktreeId);
 * ```
 */
export function useWorktreeMonitor(): Map<string, WorktreeState> {
  const [states, setStates] = useState<Map<string, WorktreeState>>(new Map());

  useEffect(() => {
    // Subscribe to worktree update events
    const unsubscribeUpdate = events.on('sys:worktree:update', (newState: WorktreeState) => {
      setStates(prev => {
        // Create new Map to trigger React re-render
        const next = new Map(prev);
        next.set(newState.id, newState);
        return next;
      });
    });

    // Subscribe to worktree removal events
    const unsubscribeRemove = events.on('sys:worktree:remove', ({ worktreeId }) => {
      setStates(prev => {
        // Create new Map without the removed worktree
        const next = new Map(prev);
        next.delete(worktreeId);
        return next;
      });
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeRemove();
    };
  }, []);

  return states;
}

/**
 * Convert WorktreeState map to Worktree array for backward compatibility.
 *
 * This helper function transforms the monitor state map back into the
 * traditional Worktree array format that components expect.
 *
 * @param states - Map of worktree states from useWorktreeMonitor
 * @returns Array of Worktree objects with enriched data
 */
export function worktreeStatesToArray(states: Map<string, WorktreeState>): Worktree[] {
  return Array.from(states.values()).map(state => ({
    id: state.id,
    path: state.path,
    name: state.name,
    branch: state.branch,
    isCurrent: state.isCurrent,
    summary: state.summary,
    summaryLoading: state.summaryLoading,
    modifiedCount: state.modifiedCount,
    mood: state.mood,
    changes: state.changes,
    lastActivityTimestamp: state.lastActivityTimestamp,
  }));
}
