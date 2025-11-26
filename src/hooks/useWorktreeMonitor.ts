import { useState, useEffect } from 'react';
import { events } from '../services/events.js';
import { worktreeService, type WorktreeState } from '../services/monitor/index.js';
import type { Worktree } from '../types/index.js';

/**
 * Hook to subscribe to WorktreeMonitor updates.
 *
 * This hook listens to the global event bus for worktree state updates
 * and maintains a map of worktree states indexed by ID.
 *
 * IMPORTANT: Initializes from worktreeService.getAllStates() to prevent
 * race conditions where events are emitted before the component mounts.
 * This ensures the dashboard renders immediately with existing state
 * even after hot-reloads or view transitions.
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
  // FIX: Initialize with current states from service instead of empty Map
  // This prevents race conditions where events fire before mount
  const [states, setStates] = useState<Map<string, WorktreeState>>(() =>
    worktreeService.getAllStates()
  );

  useEffect(() => {
    // Subscribe to events FIRST to avoid race condition where updates
    // are emitted between getAllStates() and listener registration
    const unsubscribeUpdate = events.on('sys:worktree:update', (newState: WorktreeState) => {
      setStates(prev => {
        // Create new Map to trigger React re-render
        const next = new Map(prev);
        next.set(newState.id, newState);
        return next;
      });
    });

    const unsubscribeRemove = events.on('sys:worktree:remove', ({ worktreeId }) => {
      setStates(prev => {
        // Create new Map without the removed worktree
        const next = new Map(prev);
        next.delete(worktreeId);
        return next;
      });
    });

    // THEN sync state to catch any updates between initialization and effect
    // Now that listeners are active, any concurrent updates will be captured
    setStates(worktreeService.getAllStates());

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
