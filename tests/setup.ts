/**
 * Global test setup file for Vitest.
 *
 * This file addresses memory leaks in the test suite by ensuring proper cleanup
 * of shared resources between test suites. Without this cleanup, the full test
 * suite exhausts heap memory due to:
 *
 * 1. Event listeners accumulating on the global event bus
 * 2. Git status cache cleanup intervals not being stopped
 * 3. WorktreeService monitors persisting across tests
 * 4. Performance metrics accumulating in memory
 *
 * IMPORTANT: This file uses dynamic imports to avoid loading modules before
 * tests can set up their mocks. Static imports at the top level would cause
 * the real modules to load before vi.mock() declarations take effect.
 *
 * @see https://github.com/gregpriday/canopy/issues/187
 */

import { afterEach, vi } from 'vitest';

/**
 * After each test:
 * - Remove all event listeners from the global event bus
 * - Clear git status caches
 * - Stop git cache cleanup interval
 * - Clear performance metrics
 * - Stop all worktree monitors (fire and forget - don't wait)
 * - Clear all timers
 *
 * Note: We use dynamic imports to ensure we get the potentially mocked modules
 * after vi.mock() has been processed. The cleanup functions are called on the
 * actual loaded modules (mocked or real) to ensure cleanup happens regardless.
 */
afterEach(async () => {
  // NOTE: We intentionally do NOT call events.removeAllListeners() here.
  // Doing so breaks tests that rely on App component event handlers persisting
  // across async operations within the same test. The event bus is a singleton
  // and removing all listeners mid-test causes handlers to be lost.
  // Event listener cleanup is handled by individual test unmount/cleanup.

  try {
    const { clearGitStatusCache, stopGitStatusCacheCleanup } = await import('../src/utils/git.js');
    clearGitStatusCache();
    stopGitStatusCacheCleanup();
  } catch {
    // Ignore if module fails to load (might be heavily mocked)
  }

  try {
    const { perfMonitor } = await import('../src/utils/perfMetrics.js');
    perfMonitor.clear();
  } catch {
    // Ignore if module fails to load (might be heavily mocked)
  }

  try {
    const { worktreeService } = await import('../src/services/monitor/index.js');
    void worktreeService.stopAll().catch(() => {
      // Ignore errors during cleanup
    });
  } catch {
    // Ignore if module fails to load (might be heavily mocked)
  }

  // Clear any pending timers (both fake and real timer queues)
  vi.clearAllTimers();
});
