import { useState, useEffect, useRef, useCallback } from 'react';
import { events } from '../services/events.js';
import type { WorktreeState } from '../services/monitor/index.js';
import type { Worktree } from '../types/index.js';

/**
 * Batch delay for collecting updates before triggering a React render.
 * This prevents cascade re-renders when multiple worktrees update simultaneously.
 */
const BATCH_DELAY_MS = 100;

/**
 * Hook to subscribe to WorktreeMonitor updates with batching.
 *
 * This hook listens to the global event bus for worktree state updates
 * and maintains a map of worktree states indexed by ID.
 *
 * **PERFORMANCE**: Updates are batched over a 100ms window to prevent
 * excessive React re-renders when multiple worktrees update in quick succession.
 * This is critical for maintaining low CPU usage with many active worktrees.
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

  // Pending updates that will be flushed after BATCH_DELAY_MS
  const pendingUpdates = useRef<Map<string, WorktreeState>>(new Map());
  const pendingRemovals = useRef<Set<string>>(new Set());
  const flushTimer = useRef<NodeJS.Timeout | null>(null);

  // Track mounted state to prevent post-unmount state updates
  // This guards against "setState on unmounted component" warnings
  const isMounted = useRef<boolean>(true);

  /**
   * Flush pending updates to React state.
   * This is called after the batch delay expires.
   */
  const flushUpdates = useCallback(() => {
    flushTimer.current = null;

    // Guard against post-unmount updates
    if (!isMounted.current) {
      return;
    }

    const updates = pendingUpdates.current;
    const removals = pendingRemovals.current;

    // Nothing to flush
    if (updates.size === 0 && removals.size === 0) {
      return;
    }

    setStates(prev => {
      // Start with previous state
      const next = new Map(prev);

      // Apply removals first
      for (const id of removals) {
        next.delete(id);
      }

      // Then apply updates
      for (const [id, state] of updates) {
        next.set(id, state);
      }

      // Clear pending queues
      pendingUpdates.current = new Map();
      pendingRemovals.current = new Set();

      return next;
    });
  }, []);

  /**
   * Schedule a flush if not already scheduled.
   * Guards against scheduling after unmount.
   */
  const scheduleFlush = useCallback(() => {
    // Don't schedule if unmounted or already scheduled
    if (!isMounted.current || flushTimer.current) {
      return;
    }
    flushTimer.current = setTimeout(flushUpdates, BATCH_DELAY_MS);
  }, [flushUpdates]);

  useEffect(() => {
    // Subscribe to worktree update events
    const unsubscribeUpdate = events.on('sys:worktree:update', (newState: WorktreeState) => {
      // Queue the update instead of immediately updating React state
      pendingUpdates.current.set(newState.id, newState);
      // Remove from pending removals if present (update supersedes removal)
      pendingRemovals.current.delete(newState.id);
      scheduleFlush();
    });

    // Subscribe to worktree removal events
    const unsubscribeRemove = events.on('sys:worktree:remove', ({ worktreeId }) => {
      // Queue the removal
      pendingRemovals.current.add(worktreeId);
      // Remove from pending updates if present (removal supersedes update)
      pendingUpdates.current.delete(worktreeId);
      scheduleFlush();
    });

    return () => {
      // Mark as unmounted FIRST to prevent any in-flight flushes
      isMounted.current = false;

      unsubscribeUpdate();
      unsubscribeRemove();

      // Clear any pending flush on unmount
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }

      // Clear pending queues to release memory
      pendingUpdates.current = new Map();
      pendingRemovals.current = new Set();
    };
  }, [scheduleFlush]);

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
    trafficLight: state.trafficLight,
    lastActivityTimestamp: state.lastActivityTimestamp,
  }));
}
