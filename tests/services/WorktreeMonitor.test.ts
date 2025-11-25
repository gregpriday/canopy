import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WorktreeMonitor } from '../../src/services/monitor/WorktreeMonitor.js';
import type { Worktree } from '../../src/types/index.js';
import { events } from '../../src/services/events.js';
import * as gitStatus from '../../src/utils/git.js';

// Mock the git utilities
vi.mock('../../src/utils/git.js', () => ({
  getWorktreeChangesWithStats: vi.fn(),
  invalidateGitStatusCache: vi.fn(),
}));

// Mock simple-git
vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    status: vi.fn().mockResolvedValue({
      modified: [],
      created: [],
      deleted: [],
      renamed: [],
      not_added: [],
    }),
    diff: vi.fn().mockResolvedValue(''),
    log: vi.fn().mockResolvedValue({
      latest: { message: 'feat: test commit\n\nDetails here' },
    }),
  })),
}));

const baseWorktree: Worktree = {
  id: '/test/worktree',
  path: '/test/worktree',
  name: 'feature-test',
  branch: 'feature-test',
  isCurrent: true,
};

describe('WorktreeMonitor - State Machine & Timing Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Traffic Light Decay Cycle', () => {
    it('transitions from green -> yellow after 30 seconds', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats)
        .mockResolvedValueOnce({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [],
          changedFileCount: 0,
          lastUpdated: Date.now(),
        })
        .mockResolvedValueOnce({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [{ path: 'foo.ts', status: 'modified', insertions: 1, deletions: 0 }],
          changedFileCount: 1,
          totalInsertions: 1,
          totalDeletions: 0,
          latestFileMtime: Date.now(),
          lastUpdated: Date.now(),
        });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Trigger a state change to activate traffic light
      await monitor.updateGitStatusFromService();
      expect(monitor.getState().trafficLight).toBe('green');

      // Advance 30 seconds
      await vi.advanceTimersByTimeAsync(30000);

      expect(monitor.getState().trafficLight).toBe('yellow');

      await monitor.stop();
    });

    it('transitions from yellow -> gray after 60 more seconds (90s total)', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats)
        .mockResolvedValueOnce({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [],
          changedFileCount: 0,
          lastUpdated: Date.now(),
        })
        .mockResolvedValueOnce({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [{ path: 'foo.ts', status: 'modified', insertions: 1, deletions: 0 }],
          changedFileCount: 1,
          totalInsertions: 1,
          totalDeletions: 0,
          latestFileMtime: Date.now(),
          lastUpdated: Date.now(),
        });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Trigger a state change
      await monitor.updateGitStatusFromService();
      expect(monitor.getState().trafficLight).toBe('green');

      // Advance to yellow (30s)
      await vi.advanceTimersByTimeAsync(30000);
      expect(monitor.getState().trafficLight).toBe('yellow');

      // Advance 60 more seconds (90s total)
      await vi.advanceTimersByTimeAsync(60000);

      expect(monitor.getState().trafficLight).toBe('gray');

      await monitor.stop();
    });

    it('resets to green on new activity from yellow state', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats)
        .mockResolvedValueOnce({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [],
          changedFileCount: 0,
          lastUpdated: Date.now(),
        })
        .mockResolvedValueOnce({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [{ path: 'foo.ts', status: 'modified', insertions: 1, deletions: 0 }],
          changedFileCount: 1,
          totalInsertions: 1,
          totalDeletions: 0,
          latestFileMtime: Date.now(),
          lastUpdated: Date.now(),
        })
        .mockResolvedValueOnce({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [
            { path: 'foo.ts', status: 'modified', insertions: 1, deletions: 0 },
            { path: 'bar.ts', status: 'modified', insertions: 2, deletions: 0 },
          ],
          changedFileCount: 2,
          totalInsertions: 3,
          totalDeletions: 0,
          latestFileMtime: Date.now(),
          lastUpdated: Date.now(),
        });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Trigger first change
      await monitor.updateGitStatusFromService();
      expect(monitor.getState().trafficLight).toBe('green');

      // Advance to yellow state (40s)
      await vi.advanceTimersByTimeAsync(40000);
      expect(monitor.getState().trafficLight).toBe('yellow');

      // New change detected
      await monitor.updateGitStatusFromService();

      // Should reset to green
      expect(monitor.getState().trafficLight).toBe('green');

      await monitor.stop();
    });
  });

  describe('Startup Behavior', () => {
    it('shows last commit immediately for clean worktrees', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Should have clean summary with ✅
      await vi.advanceTimersByTimeAsync(0);

      expect(monitor.getState().summary).toContain('✅');
      expect(monitor.getState().summary).toContain('feat: test commit');

      await monitor.stop();
    });
  });

  describe('Deep Equality Check', () => {
    it('prevents update emission when changes are identical', async () => {
      const identicalChanges = {
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [{ path: 'test.ts', status: 'modified', insertions: 10, deletions: 2 }],
        changedFileCount: 1,
        totalInsertions: 10,
        totalDeletions: 2,
        latestFileMtime: 12345,
        lastUpdated: Date.now(),
      };

      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue(identicalChanges);

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      let emitCount = 0;
      const handler = () => {
        emitCount++;
      };

      events.on('sys:worktree:update', handler);

      // First update
      await monitor.updateGitStatusFromService();
      const firstEmitCount = emitCount;

      // Second update with identical data
      await monitor.updateGitStatusFromService();
      const secondEmitCount = emitCount;

      // Should not emit again if data is identical (due to shouldEmitUpdate check)
      expect(secondEmitCount).toBe(firstEmitCount);

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });

    it('detects renames even when aggregate stats are identical', async () => {
      // First state: file A modified
      const stateA = {
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [{ path: 'fileA.ts', status: 'modified', insertions: 10, deletions: 2 }],
        changedFileCount: 1,
        totalInsertions: 10,
        totalDeletions: 2,
        latestFileMtime: 12345,
        lastUpdated: Date.now(),
      };

      // Second state: file A renamed to file B (same stats!)
      const stateB = {
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [{ path: 'fileB.ts', status: 'renamed', insertions: 10, deletions: 2 }],
        changedFileCount: 1,
        totalInsertions: 10,
        totalDeletions: 2,
        latestFileMtime: 12346, // Different mtime
        lastUpdated: Date.now(),
      };

      vi.mocked(gitStatus.getWorktreeChangesWithStats)
        .mockResolvedValueOnce(stateA)
        .mockResolvedValueOnce(stateB);

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      let emitCount = 0;
      const handler = () => {
        emitCount++;
      };

      events.on('sys:worktree:update', handler);

      const firstEmitCount = emitCount;

      // Second update with renamed file - different hash means different state detected
      await monitor.updateGitStatusFromService();

      // Should emit because file list changed (rename detected via hash)
      expect(emitCount).toBeGreaterThan(firstEmitCount);

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });
  });

  describe('Event Emission', () => {
    it('emits sys:worktree:update event on state changes', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [{ path: 'test.ts', status: 'modified', insertions: 10, deletions: 2 }],
        changedFileCount: 1,
        totalInsertions: 10,
        totalDeletions: 2,
        latestFileMtime: Date.now(),
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);

      const emittedStates: any[] = [];
      const handler = (state: any) => {
        emittedStates.push(state);
      };

      events.on('sys:worktree:update', handler);

      await monitor.start();

      // Should have emitted at least one update
      expect(emittedStates.length).toBeGreaterThan(0);
      expect(emittedStates[0]).toHaveProperty('worktreeId', baseWorktree.id);

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });
  });

  describe('Smart Emit - shouldEmitUpdate', () => {
    it('skips emit when only non-visible fields change', async () => {
      // State where modifiedCount stays same, but lastActivityTimestamp changes
      const stateWithChange = {
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [{ path: 'test.ts', status: 'modified', insertions: 10, deletions: 2 }],
        changedFileCount: 1,
        totalInsertions: 10,
        totalDeletions: 2,
        latestFileMtime: Date.now(),
        lastUpdated: Date.now(),
      };

      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue(stateWithChange);

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      let emitCount = 0;
      const handler = () => {
        emitCount++;
      };

      events.on('sys:worktree:update', handler);

      // First service-driven update
      await monitor.updateGitStatusFromService();
      const countAfterFirst = emitCount;

      // Second update with same visible state (no change to summary/mood/modifiedCount/trafficLight)
      await monitor.updateGitStatusFromService();
      const countAfterSecond = emitCount;

      // Should not emit again if visible state is identical
      expect(countAfterSecond).toBe(countAfterFirst);

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });

    it('emits when modifiedCount changes', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats)
        .mockResolvedValueOnce({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [{ path: 'test.ts', status: 'modified', insertions: 10, deletions: 2 }],
          changedFileCount: 1,
          totalInsertions: 10,
          totalDeletions: 2,
          latestFileMtime: Date.now(),
          lastUpdated: Date.now(),
        })
        .mockResolvedValueOnce({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [
            { path: 'test.ts', status: 'modified', insertions: 10, deletions: 2 },
            { path: 'another.ts', status: 'added', insertions: 5, deletions: 0 },
          ],
          changedFileCount: 2, // Changed!
          totalInsertions: 15,
          totalDeletions: 2,
          latestFileMtime: Date.now(),
          lastUpdated: Date.now(),
        });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      let emitCount = 0;
      const handler = () => {
        emitCount++;
      };

      events.on('sys:worktree:update', handler);
      const countBefore = emitCount;

      // Update that changes modifiedCount
      await monitor.updateGitStatusFromService();

      // Should emit because modifiedCount changed
      expect(emitCount).toBeGreaterThan(countBefore);

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });
  });

  describe('Service-Managed Polling', () => {
    it('does not start its own polling timer', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      await monitor.start();

      // The monitor should NOT have started its own setInterval for polling
      // (Polling is now managed by WorktreeService)
      const pollingIntervals = setIntervalSpy.mock.calls.filter(call => {
        // Filter out any intervals that are clearly not polling (e.g., traffic light timers use setTimeout)
        return call[1] === 2000 || call[1] === 10000 || call[1] === 30000;
      });

      expect(pollingIntervals.length).toBe(0);

      await monitor.stop();
      setIntervalSpy.mockRestore();
    });

    it('exposes updateGitStatusFromService for service-driven polling', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // The public method should exist and be callable
      expect(typeof monitor.updateGitStatusFromService).toBe('function');

      // Should not throw when called
      await expect(monitor.updateGitStatusFromService()).resolves.not.toThrow();

      await monitor.stop();
    });
  });
});
