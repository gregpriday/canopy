import { useState, useEffect, useCallback, useRef } from 'react';
import { useStdout } from 'ink';
import { events } from '../services/events.js';
import type { TerminalDimensions } from '../types/index.js';

// Re-export for convenience
export type { TerminalDimensions } from '../types/index.js';

/** Default dimensions when stdout is unavailable */
const DEFAULT_DIMENSIONS: TerminalDimensions = {
  width: 80,
  height: 24,
};

/** Minimum dimensions to prevent layout breakage */
const MIN_DIMENSIONS: TerminalDimensions = {
  width: 40,
  height: 10,
};

/** Default debounce delay in milliseconds */
const DEFAULT_DEBOUNCE_MS = 50;

interface UseTerminalDimensionsOptions {
  /** Debounce delay for resize events (default: 50ms) */
  debounceMs?: number;
  /** Emit sys:terminal:resize events (default: true) */
  emitEvents?: boolean;
}

/**
 * Hook for reactive terminal dimensions with debouncing and event emission.
 *
 * Features:
 * - Provides reactive `{ width, height }` values
 * - Debounces resize events to prevent excessive re-renders
 * - Enforces minimum dimensions to prevent layout breakage
 * - Emits `sys:terminal:resize` events for components that need resize notifications
 * - Reserves 1 row from height to prevent scroll jitter on the last line
 *
 * @param options Configuration options
 * @returns Current terminal dimensions
 */
export function useTerminalDimensions(
  options: UseTerminalDimensionsOptions = {}
): TerminalDimensions {
  const { debounceMs = DEFAULT_DEBOUNCE_MS, emitEvents = true } = options;
  const { stdout } = useStdout();

  // Get initial dimensions from stdout or use defaults
  const getInitialDimensions = useCallback((): TerminalDimensions => {
    if (!stdout) {
      return DEFAULT_DIMENSIONS;
    }

    return {
      width: Math.max(MIN_DIMENSIONS.width, stdout.columns || DEFAULT_DIMENSIONS.width),
      // Reserve 1 row for scroll jitter prevention
      height: Math.max(MIN_DIMENSIONS.height, (stdout.rows || DEFAULT_DIMENSIONS.height) - 1),
    };
  }, [stdout]);

  const [dimensions, setDimensions] = useState<TerminalDimensions>(getInitialDimensions);

  // Track debounce timer for cleanup
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle resize events with debouncing
  useEffect(() => {
    if (!stdout) {
      return;
    }

    const handleResize = () => {
      // Clear any pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce the resize handling
      debounceTimerRef.current = setTimeout(() => {
        const newDimensions: TerminalDimensions = {
          width: Math.max(MIN_DIMENSIONS.width, stdout.columns || DEFAULT_DIMENSIONS.width),
          // Reserve 1 row for scroll jitter prevention
          height: Math.max(MIN_DIMENSIONS.height, (stdout.rows || DEFAULT_DIMENSIONS.height) - 1),
        };

        setDimensions(newDimensions);

        // Emit event for other components that need to respond to resize
        if (emitEvents) {
          events.emit('sys:terminal:resize', newDimensions);
        }

        debounceTimerRef.current = null;
      }, debounceMs);
    };

    // Subscribe to resize events
    stdout.on('resize', handleResize);

    // Cleanup
    return () => {
      stdout.off('resize', handleResize);

      // Clear any pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [stdout, debounceMs, emitEvents]);

  // Update dimensions if stdout becomes available
  useEffect(() => {
    if (stdout) {
      const initialDimensions = getInitialDimensions();
      setDimensions(initialDimensions);
    }
  }, [stdout, getInitialDimensions]);

  return dimensions;
}

/**
 * Hook for subscribing to terminal resize events without managing dimensions state.
 * Useful for components that only need to react to resize events.
 *
 * @param callback Function to call when terminal is resized
 */
export function useTerminalResizeEvent(
  callback: (dimensions: TerminalDimensions) => void
): void {
  useEffect(() => {
    return events.on('sys:terminal:resize', callback);
  }, [callback]);
}
