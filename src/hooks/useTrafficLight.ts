import { useState, useEffect } from 'react';

export type TrafficColor = 'green' | 'yellow' | 'gray';

const THRESHOLDS = {
  ACTIVE: 30 * 1000,   // 30 seconds (The "Hot" zone - active development)
  COOLDOWN: 90 * 1000, // 90 seconds (The "Thinking" zone - waiting for AI feedback)
};

/**
 * Hook to provide "Traffic Light" status for a worktree based on last file change.
 *
 * - Green: File changed within last 30 seconds (active development)
 * - Yellow: File changed 30-90 seconds ago (agent thinking/waiting for AI feedback)
 * - Gray: No changes in >90 seconds (idle/complete)
 *
 * Automatically transitions between states with internal timers to force re-renders
 * at the exact moment a worktree transitions from one state to another.
 *
 * @param lastChangeTimestamp - Unix timestamp (ms) of most recent file modification
 * @returns Current traffic light color
 *
 * @example
 * ```tsx
 * const trafficColor = useTrafficLight(changes.latestFileMtime);
 * <Text color={trafficColor === 'green' ? 'green' : 'gray'}>●</Text>
 * ```
 */
export function useTrafficLight(lastChangeTimestamp: number | undefined): TrafficColor {
  // Helper to calculate current color based on time elapsed
  const getColor = (): TrafficColor => {
    if (!lastChangeTimestamp || lastChangeTimestamp === 0) return 'gray';

    const elapsed = Date.now() - lastChangeTimestamp;
    if (elapsed < THRESHOLDS.ACTIVE) return 'green';
    if (elapsed < THRESHOLDS.COOLDOWN) return 'yellow';
    return 'gray';
  };

  const [color, setColor] = useState<TrafficColor>(getColor);

  useEffect(() => {
    // Update immediately on prop change or state transition
    const newColor = getColor();

    // Only update state if it's actually different to prevent infinite loops
    // (though React bails out of same-value updates automatically)
    if (newColor !== color) {
      setColor(newColor);
    }

    // If we are already gray, no need to set timers
    if (newColor === 'gray') return;

    const elapsed = Date.now() - (lastChangeTimestamp || 0);

    // Determine time until next state transition
    let timeToNextState: number;

    if (newColor === 'green') {
      // Time until we turn yellow
      timeToNextState = THRESHOLDS.ACTIVE - elapsed;
    } else {
      // Time until we turn gray
      timeToNextState = THRESHOLDS.COOLDOWN - elapsed;
    }

    // Set timer to force re-render at the transition point
    const timer = setTimeout(() => {
      setColor(getColor());
    }, Math.max(0, timeToNextState));

    return () => clearTimeout(timer);
  }, [lastChangeTimestamp, color]); // Added color to dependencies

  return color;
}
