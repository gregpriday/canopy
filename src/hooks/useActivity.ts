import { useState, useEffect, useRef, useCallback } from 'react';
import { events } from '../services/events.js';
import { debounce } from '../utils/debounce.js';

/**
 * Temporal activity thresholds (in milliseconds)
 */
const ACTIVITY_DURATION = 2000;  // The Flash: 0-2s
const COOLDOWN_DURATION = 10000; // The Cooldown: 2-10s
const IDLE_THRESHOLD = 60000;    // The Idle State: >60s
const UPDATE_THROTTLE_MS = 200;  // Limit visual updates to 5fps
const CLEANUP_INTERVAL_MS = 2000; // Run cleanup every 2s (only when active)

export interface ActivityState {
  activeFiles: Map<string, number>; // path → timestamp
  isIdle: boolean;                   // true if no activity for 60s
}

/**
 * Hook to track real-time file activity based on watcher:change events.
 *
 * Maintains a map of file paths to their last modification timestamp.
 * Automatically cleans up stale entries and detects idle state.
 *
 * Performance optimizations:
 * - Throttles UI updates to 5fps (200ms) to prevent excessive re-renders
 * - Cleanup interval only runs when there are active files to track
 * - Stops running entirely when idle (no CPU usage when inactive)
 *
 * @returns ActivityState with activeFiles map and isIdle flag
 *
 * @example
 * ```tsx
 * const { activeFiles, isIdle } = useActivity();
 * const fileTimestamp = activeFiles.get('/path/to/file.ts');
 * const isFlashing = fileTimestamp && (Date.now() - fileTimestamp < 2000);
 * ```
 */
export function useActivity(): ActivityState {
  const [activeFiles, setActiveFiles] = useState<Map<string, number>>(new Map());
  const [isIdle, setIsIdle] = useState(true); // Start as idle (no activity yet)

  // Use a ref to store the "pending" state so we don't lose events during throttle
  const pendingUpdates = useRef<Map<string, number>>(new Map());
  const lastActivityRef = useRef<number>(0); // 0 = no activity yet
  const cleanupTimer = useRef<NodeJS.Timeout | null>(null);

  // Ref to track current activeFiles size without re-running effects
  const activeFilesCountRef = useRef<number>(0);

  // Start/stop cleanup interval based on whether we have active files
  const startCleanupInterval = useCallback(() => {
    if (cleanupTimer.current) return; // Already running

    cleanupTimer.current = setInterval(() => {
      const now = Date.now();

      setActiveFiles(prev => {
        // Optimization: Don't create new Map unless we actually delete something
        let needsPrune = false;
        for (const timestamp of prev.values()) {
          if (now - timestamp > COOLDOWN_DURATION) {
            needsPrune = true;
            break;
          }
        }

        if (!needsPrune) return prev;

        // If we need to prune, create the new map now
        const next = new Map(prev);
        for (const [filePath, timestamp] of next.entries()) {
          if (now - timestamp > COOLDOWN_DURATION) {
            next.delete(filePath);
          }
        }

        // Update ref for checking if we should stop the interval
        activeFilesCountRef.current = next.size;

        // If map is now empty, stop the interval on next tick
        if (next.size === 0) {
          setTimeout(() => {
            if (activeFilesCountRef.current === 0 && cleanupTimer.current) {
              clearInterval(cleanupTimer.current);
              cleanupTimer.current = null;
            }
          }, 0);
        }

        return next;
      });

      // Check for global idle state (>60s since last activity)
      if (lastActivityRef.current > 0 && now - lastActivityRef.current > IDLE_THRESHOLD) {
        setIsIdle(prev => prev ? prev : true); // Only update if not already idle
      }
    }, CLEANUP_INTERVAL_MS);
  }, []);

  const stopCleanupInterval = useCallback(() => {
    if (cleanupTimer.current) {
      clearInterval(cleanupTimer.current);
      cleanupTimer.current = null;
    }
  }, []);

  // Throttled flush function to update React state
  // FIX: Use maxWait equal to UPDATE_THROTTLE_MS to ensure consistent 5fps updates
  // even under sustained event traffic (e.g., npm install). Previously maxWait: 1000
  // caused updates to fire only once per second during continuous events.
  const flushUpdates = useCallback(
    debounce(() => {
      if (pendingUpdates.current.size === 0) return;

      setActiveFiles(prev => {
        const next = new Map(prev);
        // Merge pending updates
        for (const [path, timestamp] of pendingUpdates.current.entries()) {
          next.set(path, timestamp);
        }
        pendingUpdates.current.clear();

        // Update ref
        activeFilesCountRef.current = next.size;

        return next;
      });
      setIsIdle(false);
    }, UPDATE_THROTTLE_MS, { leading: true, trailing: true, maxWait: UPDATE_THROTTLE_MS }),
    []
  );

  useEffect(() => {
    // Subscribe to file watcher events
    const handleFileChange = ({ path }: { path: string }) => {
      const now = Date.now();
      pendingUpdates.current.set(path, now);
      lastActivityRef.current = now;

      // Start cleanup interval if not already running
      startCleanupInterval();

      flushUpdates();
    };

    const unsubscribe = events.on('watcher:change', handleFileChange);

    return () => {
      unsubscribe();
      stopCleanupInterval();
      flushUpdates.cancel();
    };
  }, [flushUpdates, startCleanupInterval, stopCleanupInterval]);

  return { activeFiles, isIdle };
}

/**
 * Helper to determine temporal state for a given file path.
 *
 * @param filePath - Absolute file path
 * @param activeFiles - Map from useActivity hook
 * @returns Temporal state: 'flash' | 'cooldown' | 'normal'
 */
export function getTemporalState(
  filePath: string,
  activeFiles: Map<string, number>
): 'flash' | 'cooldown' | 'normal' {
  const timestamp = activeFiles.get(filePath);
  if (!timestamp) return 'normal';

  const elapsed = Date.now() - timestamp;

  if (elapsed < ACTIVITY_DURATION) {
    return 'flash'; // 0-2s: The Flash
  }

  if (elapsed < COOLDOWN_DURATION) {
    return 'cooldown'; // 2-10s: The Cooldown
  }

  return 'normal'; // >10s: Cleaned up (should not reach here due to cleanup loop)
}
