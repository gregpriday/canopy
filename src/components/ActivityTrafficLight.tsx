import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import { getHeatColor } from '../utils/colorInterpolation.js';

interface Props {
  timestamp?: number | null;
}

export const ActivityTrafficLight: React.FC<Props> = ({ timestamp }) => {
  const [color, setColor] = useState(getHeatColor(timestamp));

  useEffect(() => {
    if (!timestamp) {
        setColor('#808080'); // Gray
        return;
    }

    // Only run the high-frequency timer if within the active window (< 90 seconds)
    // This saves CPU when the dashboard is idle
    const isIdle = Date.now() - timestamp > 90000;
    if (isIdle) {
        setColor('#6B7280');
        return;
    }

    const interval = setInterval(() => {
      setColor(getHeatColor(timestamp));
    }, 200); // 5 FPS update rate is sufficient for terminal text

    return () => clearInterval(interval);
  }, [timestamp]);

  return <Text color={color}>●</Text>;
};
