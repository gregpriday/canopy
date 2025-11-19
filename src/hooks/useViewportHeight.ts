import { useState, useEffect } from 'react';
import { useStdout } from 'ink';
import { calculateViewportHeight } from '../utils/treeViewVirtualization.js';

/**
 * Custom hook for tracking viewport height with terminal resize support.
 *
 * Encapsulates stdout resize measurements for reuse by App and TreeView.
 * Ensures both use the same reserved-row calculation for consistent behavior.
 *
 * @param reservedRows - Number of rows reserved for header/status bar (default: 3)
 * @returns Current viewport height in rows
 *
 * @example
 * ```typescript
 * const viewportHeight = useViewportHeight();
 * // Returns available height for tree content, auto-updates on terminal resize
 * ```
 */
export function useViewportHeight(reservedRows = 3): number {
  const { stdout } = useStdout();
  const [viewportHeight, setViewportHeight] = useState(() =>
    calculateViewportHeight(reservedRows)
  );

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(calculateViewportHeight(reservedRows));
    };

    if (stdout) {
      stdout.on('resize', handleResize);
      return () => {
        stdout.off('resize', handleResize);
      };
    }
  }, [stdout, reservedRows]);

  return viewportHeight;
}
