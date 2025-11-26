import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WorktreeMonitor } from '../../src/services/monitor/WorktreeMonitor.js';
import type { Worktree } from '../../src/types/index.js';
import { events } from '../../src/services/events.js';
import * as gitStatus from '../../src/utils/git.js';
import * as worktreeMood from '../../src/utils/worktreeMood.js';
import { WorktreeRemovedError } from '../../src/utils/errorTypes.js';

// Mock the git utilities
vi.mock('../../src/utils/git.js', () => ({
  getWorktreeChangesWithStats: vi.fn(),
  invalidateGitStatusCache: vi.fn(),
}));

// Mock worktree mood
vi.mock('../../src/utils/worktreeMood.js', () => ({
  categorizeWorktree: vi.fn().mockResolvedValue('stable'),
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

// Mock AI worktree service
vi.mock('../../src/services/ai/worktree.js', () => ({
  generateWorktreeSummary: vi.fn().mockResolvedValue({
    summary: '🔧 Working on test changes',
    modifiedCount: 1,
  }),
}));

const baseWorktree: Worktree = {
  id: '/test/worktree',
  path: '/test/worktree',
  name: 'feature-test',
  branch: 'feature-test',
  isCurrent: true,
};

describe('WorktreeMonitor - Atomic State Updates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Single Atomic Emission', () => {
    it('emits stats and summary together in single update when transitioning to clean', async () => {
      // Start with dirty state, then become clean
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
          // Clean state
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [],
          changedFileCount: 0,
          totalInsertions: 0,
          totalDeletions: 0,
          latestFileMtime: 0,
          lastUpdated: Date.now(),
        });

      const monitor = new WorktreeMonitor(baseWorktree);
      const emittedStates: any[] = [];
      const handler = (state: any) => {
        emittedStates.push({ ...state });
      };

      events.on('sys:worktree:update', handler);

      // Start with dirty state
      await monitor.start();

      // Clear previous emissions
      emittedStates.length = 0;

      // Trigger update to clean state
      await (monitor as any).updateGitStatus(true);

      // Should have exactly 1 emission (atomic update)
      expect(emittedStates.length).toBe(1);

      // The single emission should have both 0 files AND clean summary
      const finalState = emittedStates[0];
      expect(finalState.modifiedCount).toBe(0);
      expect(finalState.summary).toContain('✅');
      expect(finalState.summary).toContain('feat: test commit');

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });

    it('does not emit separate stats and summary updates (no flickering)', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        totalInsertions: 0,
        totalDeletions: 0,
        latestFileMtime: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      const emittedStates: any[] = [];
      const handler = (state: any) => {
        emittedStates.push({
          modifiedCount: state.modifiedCount,
          summary: state.summary,
          timestamp: Date.now(),
        });
      };

      events.on('sys:worktree:update', handler);

      await monitor.start();

      // Each emission should have consistent modifiedCount and summary
      for (const state of emittedStates) {
        if (state.modifiedCount === 0) {
          // Clean state should always have ✅ summary
          expect(state.summary).toContain('✅');
        }
      }

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });
  });

  describe('Activity Timestamp Tracking', () => {
    it('updates lastActivityTimestamp when changes are detected', async () => {
      let callCount = 0;
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockImplementation(async () => {
        callCount++;
        return {
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [{ path: `file${callCount}.ts`, status: 'modified', insertions: callCount, deletions: 0 }],
          changedFileCount: 1,
          totalInsertions: callCount,
          totalDeletions: 0,
          latestFileMtime: Date.now(),
          lastUpdated: Date.now(),
        };
      });

      const monitor = new WorktreeMonitor(baseWorktree);

      await monitor.start();

      // Stop polling so it doesn't interfere
      (monitor as any).stopPolling();

      // Trigger another state change (will see different file)
      const beforeChange = Date.now();
      await (monitor as any).updateGitStatus(true);
      const afterChange = Date.now();

      // Should have updated lastActivityTimestamp
      const timestamp = monitor.getState().lastActivityTimestamp;
      expect(timestamp).not.toBeNull();
      expect(timestamp).toBeGreaterThanOrEqual(beforeChange);
      expect(timestamp).toBeLessThanOrEqual(afterChange);

      await monitor.stop();
    });

    it('preserves lastActivityTimestamp on subsequent changes', async () => {
      let callCount = 0;
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockImplementation(async () => {
        callCount++;
        return {
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [{ path: `file${callCount}.ts`, status: 'modified', insertions: callCount, deletions: 0 }],
          changedFileCount: 1,
          totalInsertions: callCount,
          totalDeletions: 0,
          latestFileMtime: Date.now(),
          lastUpdated: Date.now(),
        };
      });

      const monitor = new WorktreeMonitor(baseWorktree);

      await monitor.start();

      // Stop polling so it doesn't interfere
      (monitor as any).stopPolling();

      // First change
      await (monitor as any).updateGitStatus(true);
      const firstTimestamp = monitor.getState().lastActivityTimestamp;

      // Advance time a bit
      await vi.advanceTimersByTimeAsync(1000);

      // Second change
      await (monitor as any).updateGitStatus(true);
      const secondTimestamp = monitor.getState().lastActivityTimestamp;

      // Second timestamp should be newer
      expect(secondTimestamp).toBeGreaterThan(firstTimestamp!);

      await monitor.stop();
    });
  });

  describe('Clean State Handling', () => {
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

    it('cancels pending AI timer when transitioning to clean', async () => {
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
        .mockResolvedValue({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [],
          changedFileCount: 0,
          lastUpdated: Date.now(),
        });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Trigger another change to start AI buffer
      await (monitor as any).updateGitStatus(true);

      // Now transition to clean
      await (monitor as any).updateGitStatus(true);

      // Summary should show clean state (last commit)
      expect(monitor.getState().summary).toContain('✅');

      await monitor.stop();
    });
  });

  describe('Hash-Based Change Detection', () => {
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
      await (monitor as any).updateGitStatus();
      const firstEmitCount = emitCount;

      // Second update with identical data
      await (monitor as any).updateGitStatus();
      const secondEmitCount = emitCount;

      // Should not emit again if data is identical
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
        latestFileMtime: 12346,
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

      // Second update with renamed file
      await (monitor as any).updateGitStatus();

      // Should emit because file list changed (rename detected)
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

  describe('AI Summary Integration', () => {
    it('triggers AI summary for dirty worktrees after atomic emission', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [{ path: 'dirty.ts', status: 'modified', insertions: 10, deletions: 5 }],
        changedFileCount: 1,
        totalInsertions: 10,
        totalDeletions: 5,
        latestFileMtime: Date.now(),
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      const triggerAISpy = vi.spyOn(monitor as any, 'triggerAISummary');

      await monitor.start();

      // Should trigger AI (fire and forget)
      expect(triggerAISpy).toHaveBeenCalled();

      await monitor.stop();
    });

    it('AI summary emits its own update when complete', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [{ path: 'dirty.ts', status: 'modified', insertions: 10, deletions: 5 }],
        changedFileCount: 1,
        totalInsertions: 10,
        totalDeletions: 5,
        latestFileMtime: Date.now(),
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      const emittedStates: any[] = [];
      const handler = (state: any) => {
        emittedStates.push({ ...state });
      };

      events.on('sys:worktree:update', handler);

      await monitor.start();

      // Wait for AI summary to complete
      await vi.advanceTimersByTimeAsync(100);

      // Should have multiple emissions: initial + AI summary
      expect(emittedStates.length).toBeGreaterThanOrEqual(1);

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });
  });

  describe('Error Handling', () => {
    it('handles git index.lock gracefully', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats)
        .mockResolvedValueOnce({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [],
          changedFileCount: 0,
          lastUpdated: Date.now(),
        })
        .mockRejectedValueOnce(new Error('index.lock exists'));

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Should not throw or set error mood
      await expect((monitor as any).updateGitStatus()).resolves.not.toThrow();

      // Mood should not be error (index.lock is handled gracefully)
      expect(monitor.getState().mood).not.toBe('error');

      await monitor.stop();
    });

    it('sets mood to error on other git failures', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats)
        .mockResolvedValueOnce({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [],
          changedFileCount: 0,
          lastUpdated: Date.now(),
        })
        .mockRejectedValueOnce(new Error('Fatal git error'));

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      await (monitor as any).updateGitStatus();

      expect(monitor.getState().mood).toBe('error');

      await monitor.stop();
    });

    it('sets error mood but keeps monitor running when worktree directory is inaccessible', async () => {
      // This tests the resilient error handling behavior:
      // When WorktreeRemovedError occurs (e.g., transient filesystem error),
      // the monitor should NOT stop itself or emit removal events.
      // Instead, it sets mood to 'error' and keeps running so it can recover
      // if the error was transient. The useAppLifecycle hook will detect actual
      // worktree removal via `git worktree list` and clean up properly.
      vi.mocked(gitStatus.getWorktreeChangesWithStats)
        .mockResolvedValueOnce({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [],
          changedFileCount: 0,
          lastUpdated: Date.now(),
        })
        .mockRejectedValueOnce(new WorktreeRemovedError(baseWorktree.path));

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Track removal events (should NOT receive any)
      const removedWorktrees: string[] = [];
      const handler = (payload: { worktreeId: string }) => {
        removedWorktrees.push(payload.worktreeId);
      };
      events.on('sys:worktree:remove', handler);

      const stopSpy = vi.spyOn(monitor, 'stop');

      // Trigger update that will fail with WorktreeRemovedError
      await (monitor as any).updateGitStatus();

      // Should NOT emit removal event (monitor stays resilient)
      expect(removedWorktrees).not.toContain(baseWorktree.id);

      // Should NOT stop the monitor (allows recovery from transient errors)
      expect(stopSpy).not.toHaveBeenCalled();

      // Should set mood to error
      expect(monitor.getState().mood).toBe('error');

      // Should set appropriate error summary
      expect(monitor.getState().summary).toContain('not accessible');

      events.off('sys:worktree:remove', handler);
      await monitor.stop();
    });

    it('continues polling when worktree is temporarily inaccessible (allows recovery)', async () => {
      // This tests the resilient polling behavior:
      // Even when WorktreeRemovedError occurs, the monitor keeps polling
      // so it can recover if the directory becomes accessible again.
      // This handles transient filesystem errors during heavy IO operations.
      let callCount = 0;
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call succeeds (initial state)
          return {
            worktreeId: baseWorktree.id,
            rootPath: baseWorktree.path,
            changes: [],
            changedFileCount: 0,
            lastUpdated: Date.now(),
          };
        }
        // Subsequent calls fail with directory removed
        throw new WorktreeRemovedError(baseWorktree.path);
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Advance timer to trigger polling
      await vi.advanceTimersByTimeAsync(2000);

      const callCountAfterFirstError = callCount;

      // Monitor should stay in error mood but keep polling
      expect(monitor.getState().mood).toBe('error');

      // Advance more time - polling should continue (for recovery attempts)
      await vi.advanceTimersByTimeAsync(10000);

      // Call count should increase (polling continues)
      expect(callCount).toBeGreaterThan(callCountAfterFirstError);

      await monitor.stop();
    });

    it('recovers from error state when directory becomes accessible again', async () => {
      // This tests the recovery scenario:
      // After a transient filesystem error, when the directory becomes accessible again,
      // the monitor should automatically recover and return to a healthy state.
      // The key verification is that the mood returns to normal after the error.
      let callCount = 0;
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call succeeds (initial state with some changes)
          return {
            worktreeId: baseWorktree.id,
            rootPath: baseWorktree.path,
            changes: [{ path: 'file.ts', status: 'modified' as const, insertions: 1, deletions: 0 }],
            changedFileCount: 1,
            lastUpdated: Date.now(),
          };
        }
        if (callCount === 2) {
          // Second call fails with directory removed (transient error)
          throw new WorktreeRemovedError(baseWorktree.path);
        }
        // Third+ calls succeed again (directory recovered with different state)
        return {
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [{ path: 'file.ts', status: 'modified' as const, insertions: 2, deletions: 0 }],
          changedFileCount: 1,
          lastUpdated: Date.now(),
        };
      });

      // Mock categorizeWorktree to return 'active' for dirty worktrees
      vi.mocked(worktreeMood.categorizeWorktree).mockResolvedValue('active');

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Initial state should be active (has changes, categorizeWorktree returns 'active')
      expect(monitor.getState().mood).toBe('active');

      // Advance timer to trigger polling - this will fail
      await vi.advanceTimersByTimeAsync(2000);

      // Monitor should be in error state (error handling sets this directly)
      expect(monitor.getState().mood).toBe('error');
      expect(monitor.getState().summary).toContain('not accessible');

      // Advance timer again - this should succeed and recover
      await vi.advanceTimersByTimeAsync(2000);

      // Monitor should recover from error state - the critical assertion
      // The mood is updated by categorizeWorktree which we mocked to return 'active'
      expect(monitor.getState().mood).toBe('active');

      // Verify we actually polled a third time (recovery attempt succeeded)
      expect(callCount).toBeGreaterThanOrEqual(3);

      await monitor.stop();
    });
  });

  describe('Polling Behavior', () => {
    it('starts polling after initial fetch', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      const startPollingSpy = vi.spyOn(monitor as any, 'startPolling');

      await monitor.start();

      expect(startPollingSpy).toHaveBeenCalled();

      await monitor.stop();
    });

    it('stops polling when monitor is stopped', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      const stopPollingSpy = vi.spyOn(monitor as any, 'stopPolling');

      await monitor.stop();

      expect(stopPollingSpy).toHaveBeenCalled();
    });
  });
});
