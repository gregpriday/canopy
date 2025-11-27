import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import { getHeatColor } from '../utils/colorInterpolation.js';

interface Props {
  timestamp?: number | null;
}

export const ActivityTrafficLight: React.FC<Props> = ({ timestamp }) => {
  const [color, setColor] = useState(getHeatColor(timestamp));

  useEffect(() => {
    // Immediately update color when timestamp changes (or on mount)
    // This ensures the color reflects the current state without waiting for interval
    const currentColor = getHeatColor(timestamp);
    setColor(currentColor);

    if (!timestamp) {
      // No timestamp = gray, no interval needed
      return;
    }

    // Only run the high-frequency timer if within the active window (< 90 seconds)
    // This saves CPU when the dashboard is idle
    const isIdle = Date.now() - timestamp > 90000;
    if (isIdle) {
      // Already set to gray via getHeatColor above, no interval needed
      return;
    }

    // Start interval for smooth color transitions
    // The interval also checks for idle state and clears itself when the timestamp ages past 90s
    const interval = setInterval(() => {
      const elapsed = Date.now() - timestamp;
      if (elapsed > 90000) {
        // Timestamp is now stale - set to gray and stop the interval
        setColor('#6B7280');
        clearInterval(interval);
        return;
      }
      setColor(getHeatColor(timestamp));
    }, 200); // 5 FPS update rate is sufficient for terminal text

    return () => clearInterval(interval);
  }, [timestamp]);

  return <Text color={color}>●</Text>;
};
