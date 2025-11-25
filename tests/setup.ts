import { afterEach, vi } from 'vitest';
import { cleanup } from 'ink-testing-library';

// Ensure tests run with the expected environment flag.
process.env.NODE_ENV = 'test';

/**
 * Globally mock heavy singletons so they never start timers/watchers during unit tests.
 * Integration tests can opt into real implementations with vi.unmock at the top of the file.
 */
vi.mock('../src/services/monitor/index.js', () => ({
  worktreeService: {
    sync: vi.fn(),
    refresh: vi.fn(),
    stopAll: vi.fn(),
    getMonitor: vi.fn(),
    getAllStates: vi.fn(() => new Map()),
  },
  WorktreeMonitor: vi.fn(),
}));

vi.mock('../src/utils/git.js', async () => {
  const actual = await vi.importActual<typeof import('../src/utils/git.js')>('../src/utils/git.js');
  return {
    ...actual,
    startGitStatusCacheCleanup: vi.fn(),
    stopGitStatusCacheCleanup: vi.fn(),
  };
});

vi.mock('../src/utils/perfMetrics.js', () => ({
  perfMonitor: {
    recordMetric: vi.fn(),
    measure: vi.fn((name: string, fn: () => unknown) => fn()),
    clear: vi.fn(),
  },
}));

afterEach(async () => {
  cleanup();

  // Keep the event bus clean between tests without reloading modules.
  try {
    const { events } = await import('../src/services/events.js');
    events.removeAllListeners();
  } catch {
    // Ignore if module fails to load (e.g., mocked tests)
  }

  vi.clearAllTimers();
  vi.clearAllMocks();
  vi.useRealTimers();

  // Encourage GC between tests to keep memory stable in long runs.
  if (typeof global.gc === 'function') {
    global.gc();
  }
});
