import { useEffect, useRef } from 'react';
import { runCopyTree } from '../utils/copytree.js';
import { events } from '../services/events.js';
import type { CanopyConfig } from '../types/index.js';

/**
 * CopyTree service hook - centralized listener and executor for CopyTree operations.
 *
 * This hook subscribes to `file:copy-tree` events at the application level, ensuring
 * CopyTree functionality works regardless of UI component visibility/mount state.
 *
 * Features:
 * - Single centralized listener (no duplicate subscriptions)
 * - Concurrency guard to prevent overlapping executions
 * - Emits notifications via event bus for UI feedback
 * - Uses latest activeRootPath via ref to avoid stale closures
 *
 * @param activeRootPath - Current root directory path (updates when switching worktrees)
 * @param config - Active Canopy configuration (used to resolve CopyTree profiles)
 */
export function useCopyTree(activeRootPath: string, config: CanopyConfig): void {
  // Track in-flight state to prevent concurrent executions
  const isRunningRef = useRef(false);

  // Keep active root path in a ref so the event handler always uses the latest value
  const activeRootPathRef = useRef(activeRootPath);
  activeRootPathRef.current = activeRootPath;

  // Keep config in a ref to avoid stale closures when settings change
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    // Subscribe to file:copy-tree events
    const unsubscribe = events.on('file:copy-tree', async (payload = {}) => {
      // Guard against concurrent executions
      if (isRunningRef.current) {
        events.emit('ui:notify', {
          type: 'warning',
          message: 'CopyTree is already running',
        });
        return;
      }

      try {
        isRunningRef.current = true;

        // Use payload rootPath if provided, otherwise use activeRootPath
        const targetPath = payload.rootPath || activeRootPathRef.current;
        const profile = payload.profile || 'default';
        const extraArgs = payload.extraArgs || [];
        const files = payload.files || [];
        const combinedArgs = [...extraArgs, ...files];

        // Execute CopyTree
        const output = await runCopyTree(
          targetPath,
          configRef.current,
          combinedArgs
        );

        // Parse output to extract last meaningful line (removing ANSI codes)
        const lines = output
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);

        let lastLine = lines.length > 0 ? lines[lines.length - 1] : '📎 Copied!';
        // Remove ANSI escape codes for clean notification display
        // eslint-disable-next-line no-control-regex
        lastLine = lastLine.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

        // Emit success notification
        events.emit('ui:notify', {
          type: 'success',
          message: lastLine,
        });
      } catch (error: any) {
        // Extract first line of error message for concise notification
        const errorMsg = (error.message || 'CopyTree failed').split('\n')[0];

        // Emit error notification
        events.emit('ui:notify', {
          type: 'error',
          message: errorMsg,
        });
      } finally {
        // Always reset running flag to allow subsequent executions
        isRunningRef.current = false;
      }
    });

    // Cleanup: unsubscribe on unmount
    return unsubscribe;
  }, []); // Empty deps - listener uses refs for latest values
}
