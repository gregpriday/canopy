import { useState, useEffect, useRef } from 'react';
import { events } from '../services/events.js';

/**
 * Temporal activity thresholds (in milliseconds)
 */
const ACTIVITY_DURATION = 2000;  // The Flash: 0-2s
const COOLDOWN_DURATION = 10000; // The Cooldown: 2-10s
const IDLE_THRESHOLD = 60000;    // The Idle State: >60s

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
  const [isIdle, setIsIdle] = useState(false);
  const cleanupTimer = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    // Subscribe to file watcher events
    const handleFileChange = ({ path }: { path: string }) => {
      const now = Date.now();
      setActiveFiles(prev => {
        const next = new Map(prev);
        next.set(path, now);
        return next;
      });
      lastActivityRef.current = now;
      setIsIdle(false);
    };

    const unsubscribe = events.on('watcher:change', handleFileChange);

    // Cleanup loop: Remove stale entries and detect idle state
    cleanupTimer.current = setInterval(() => {
      const now = Date.now();

      setActiveFiles(prev => {
        const next = new Map(prev);
        let hasChanges = false;

        // Remove files older than COOLDOWN_DURATION (10s)
        for (const [filePath, timestamp] of next.entries()) {
          if (now - timestamp > COOLDOWN_DURATION) {
            next.delete(filePath);
            hasChanges = true;
          }
        }

        return hasChanges ? next : prev;
      });

      // Check for global idle state (>60s since last activity)
      if (now - lastActivityRef.current > IDLE_THRESHOLD) {
        setIsIdle(true);
      }
    }, 1000); // Check every 1s (very cheap)

    return () => {
      unsubscribe();
      if (cleanupTimer.current) {
        clearInterval(cleanupTimer.current);
      }
    };
  }, []); // Empty deps - effect stays mounted for component lifetime

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
