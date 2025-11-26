import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Worktree } from '../../src/types/index.js';

// Create a mock class that can be instantiated
class MockWorktreeMonitor {
  id: string;
  path: string;
  start = vi.fn().mockResolvedValue(undefined);
  stop = vi.fn().mockResolvedValue(undefined);
  fetchInitialStatus = vi.fn().mockResolvedValue(undefined);
  setPollingInterval = vi.fn();
  updateMetadata = vi.fn();
  refresh = vi.fn().mockResolvedValue(undefined);

  constructor(worktree: Worktree) {
    this.id = worktree.id;
    this.path = worktree.path;
  }

  getState() {
    return {
      id: this.id,
      path: this.path,
      name: 'test',
      branch: 'test',
      isCurrent: true,
      worktreeId: this.id,
      worktreeChanges: null,
      mood: 'stable',
      summary: 'Test summary',
      summaryLoading: false,
      modifiedCount: 0,
      changes: [],
      lastActivityTimestamp: null,
    };
  }
}

// Store created instances
const mockInstances: MockWorktreeMonitor[] = [];

// Mock WorktreeMonitor with a proper class
vi.mock('../../src/services/monitor/WorktreeMonitor.js', () => {
  return {
    WorktreeMonitor: class {
      id: string;
      path: string;
      start = vi.fn().mockResolvedValue(undefined);
      stop = vi.fn().mockResolvedValue(undefined);
      fetchInitialStatus = vi.fn().mockResolvedValue(undefined);
      setPollingInterval = vi.fn();
      updateMetadata = vi.fn();
      refresh = vi.fn().mockResolvedValue(undefined);

      constructor(worktree: Worktree) {
        this.id = worktree.id;
        this.path = worktree.path;
        mockInstances.push(this as unknown as MockWorktreeMonitor);
      }

      getState() {
        return {
          id: this.id,
          path: this.path,
          name: 'test',
          branch: 'test',
          isCurrent: true,
          worktreeId: this.id,
          worktreeChanges: null,
          mood: 'stable',
          summary: 'Test summary',
          summaryLoading: false,
          modifiedCount: 0,
          changes: [],
          lastActivityTimestamp: null,
        };
      }
    },
  };
});

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
  logDebug: vi.fn(),
}));

const baseWorktree: Worktree = {
  id: '/test/worktree',
  path: '/test/worktree',
  name: 'feature-test',
  branch: 'feature-test',
  isCurrent: true,
};

const secondWorktree: Worktree = {
  id: '/test/worktree-2',
  path: '/test/worktree-2',
  name: 'feature-2',
  branch: 'feature-2',
  isCurrent: false,
};

describe('WorktreeService - watchingEnabled parameter', () => {
  let worktreeService: any;

  beforeEach(async () => {
    // Clear mock instances
    mockInstances.length = 0;
    vi.clearAllMocks();

    // Re-import to get fresh service instance
    vi.resetModules();
    const module = await import('../../src/services/monitor/WorktreeService.js');
    worktreeService = module.worktreeService;
  });

  afterEach(async () => {
    if (worktreeService) {
      await worktreeService.stopAll();
    }
    vi.clearAllMocks();
  });

  describe('sync() with watchingEnabled=true', () => {
    it('calls monitor.start() when watchingEnabled is true', async () => {
      await worktreeService.sync([baseWorktree], baseWorktree.id, 'main', true);

      expect(mockInstances.length).toBe(1);
      const instance = mockInstances[0];
      expect(instance.start).toHaveBeenCalled();
      expect(instance.fetchInitialStatus).not.toHaveBeenCalled();
    });

    it('starts polling for all worktrees when watchingEnabled is true', async () => {
      await worktreeService.sync([baseWorktree, secondWorktree], baseWorktree.id, 'main', true);

      expect(mockInstances.length).toBe(2);

      for (const instance of mockInstances) {
        expect(instance.start).toHaveBeenCalled();
        expect(instance.fetchInitialStatus).not.toHaveBeenCalled();
      }
    });
  });

  describe('sync() with watchingEnabled=false (--no-watch mode)', () => {
    it('calls monitor.fetchInitialStatus() when watchingEnabled is false', async () => {
      await worktreeService.sync([baseWorktree], baseWorktree.id, 'main', false);

      expect(mockInstances.length).toBe(1);
      const instance = mockInstances[0];
      expect(instance.start).not.toHaveBeenCalled();
      expect(instance.fetchInitialStatus).toHaveBeenCalled();
    });

    it('fetches initial status for all worktrees when watchingEnabled is false', async () => {
      await worktreeService.sync([baseWorktree, secondWorktree], baseWorktree.id, 'main', false);

      expect(mockInstances.length).toBe(2);

      for (const instance of mockInstances) {
        expect(instance.start).not.toHaveBeenCalled();
        expect(instance.fetchInitialStatus).toHaveBeenCalled();
      }
    });

    it('still sets polling interval even in no-watch mode', async () => {
      await worktreeService.sync([baseWorktree], baseWorktree.id, 'main', false);

      const instance = mockInstances[0];
      expect(instance.setPollingInterval).toHaveBeenCalled();
    });
  });

  describe('refresh() works regardless of watchingEnabled', () => {
    it('allows manual refresh when watchingEnabled is true', async () => {
      await worktreeService.sync([baseWorktree], baseWorktree.id, 'main', true);

      // refresh() should work
      await expect(worktreeService.refresh()).resolves.not.toThrow();
    });

    it('allows manual refresh when watchingEnabled is false', async () => {
      await worktreeService.sync([baseWorktree], baseWorktree.id, 'main', false);

      // refresh() should still work (this is how 'r' key works)
      await expect(worktreeService.refresh()).resolves.not.toThrow();
    });
  });

  describe('existing monitors behavior on watchingEnabled change', () => {
    it('does not restart existing monitors when watchingEnabled changes', async () => {
      // First sync with watching enabled
      await worktreeService.sync([baseWorktree], baseWorktree.id, 'main', true);

      expect(mockInstances.length).toBe(1);
      const firstInstance = mockInstances[0];
      const firstStartCallCount = firstInstance.start.mock.calls.length;

      // Second sync with same worktree but watching disabled
      await worktreeService.sync([baseWorktree], baseWorktree.id, 'main', false);

      // Should not create a new monitor for existing worktree
      // (existing monitors are updated, not recreated)
      expect(mockInstances.length).toBe(1);

      // start() should not be called again for existing monitor
      expect(firstInstance.start.mock.calls.length).toBe(firstStartCallCount);
    });
  });
});
