import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WorktreeMonitor } from '../../src/services/monitor/WorktreeMonitor.js';
import type { Worktree } from '../../src/types/index.js';
import { events } from '../../src/services/events.js';
import * as gitStatus from '../../src/utils/git.js';
import * as worktreeMood from '../../src/utils/worktreeMood.js';
import { WorktreeRemovedError } from '../../src/utils/errorTypes.js';
import * as fs from 'fs/promises';
import * as childProcess from 'child_process';

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

// Mock fs/promises for AI note file reading
vi.mock('fs/promises', () => ({
  stat: vi.fn(),
  readFile: vi.fn(),
}));

// Mock child_process for git directory resolution
vi.mock('child_process', () => ({
  execSync: vi.fn(() => '.git'),
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
    // Default stat mock - returns mtime for note file timestamp
    vi.mocked(fs.stat).mockResolvedValue({
      mtimeMs: Date.now(),
    } as any);
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
    it('sets lastActivityTimestamp on initial load when worktree has changes (dirty)', async () => {
      // This test verifies that when a worktree starts with pending changes,
      // the traffic light shows activity immediately (not gray)
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [{ path: 'existing-change.ts', status: 'modified', insertions: 5, deletions: 2 }],
        changedFileCount: 1,
        totalInsertions: 5,
        totalDeletions: 2,
        latestFileMtime: Date.now(),
        lastUpdated: Date.now(),
      });

      const beforeStart = Date.now();
      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();
      const afterStart = Date.now();

      // Should have set lastActivityTimestamp on initial load
      const timestamp = monitor.getState().lastActivityTimestamp;
      expect(timestamp).not.toBeNull();
      expect(timestamp).toBeGreaterThanOrEqual(beforeStart);
      expect(timestamp).toBeLessThanOrEqual(afterStart);

      await monitor.stop();
    });

    it('does not set lastActivityTimestamp on initial load when worktree is clean', async () => {
      // Clean worktrees should show gray traffic light (no recent activity)
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
      await monitor.start();

      // Should NOT set lastActivityTimestamp for clean worktrees
      expect(monitor.getState().lastActivityTimestamp).toBeNull();

      await monitor.stop();
    });

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

  describe('fetchInitialStatus (--no-watch mode)', () => {
    it('fetches initial status without starting polling', async () => {
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
      const startPollingSpy = vi.spyOn(monitor as any, 'startPolling');

      await monitor.fetchInitialStatus();

      // Should NOT start polling
      expect(startPollingSpy).not.toHaveBeenCalled();

      // But should have fetched and updated state
      const state = monitor.getState();
      expect(state.modifiedCount).toBe(1);
      expect(state.worktreeChanges).not.toBeNull();

      await monitor.stop();
    });

    it('emits update event after initial fetch in no-watch mode', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      const emittedStates: any[] = [];
      const handler = (state: any) => {
        emittedStates.push({ ...state });
      };

      events.on('sys:worktree:update', handler);

      await monitor.fetchInitialStatus();

      // Should have emitted at least one update
      expect(emittedStates.length).toBeGreaterThan(0);
      expect(emittedStates[0]).toHaveProperty('worktreeId', baseWorktree.id);

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });

    it('allows manual refresh() to work after fetchInitialStatus', async () => {
      let callCount = 0;
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockImplementation(async () => {
        callCount++;
        return {
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: callCount > 1
            ? [{ path: 'new.ts', status: 'added', insertions: 5, deletions: 0 }]
            : [],
          changedFileCount: callCount > 1 ? 1 : 0,
          totalInsertions: callCount > 1 ? 5 : 0,
          totalDeletions: 0,
          latestFileMtime: Date.now(),
          lastUpdated: Date.now(),
        };
      });

      const monitor = new WorktreeMonitor(baseWorktree);

      // Initial fetch without polling
      await monitor.fetchInitialStatus();
      expect(monitor.getState().modifiedCount).toBe(0);

      // Manual refresh should still work
      await monitor.refresh();
      expect(monitor.getState().modifiedCount).toBe(1);

      await monitor.stop();
    });

    it('does not auto-poll after fetchInitialStatus even after time passes', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);

      await monitor.fetchInitialStatus();

      const gitCallCount = vi.mocked(gitStatus.getWorktreeChangesWithStats).mock.calls.length;

      // Advance time by 10 seconds (well past any polling interval)
      await vi.advanceTimersByTimeAsync(10000);

      // Should NOT have made additional calls (no polling)
      expect(vi.mocked(gitStatus.getWorktreeChangesWithStats).mock.calls.length).toBe(gitCallCount);

      await monitor.stop();
    });

    it('setPollingInterval does not restart polling after fetchInitialStatus', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      const startPollingSpy = vi.spyOn(monitor as any, 'startPolling');

      // Use fetchInitialStatus (--no-watch mode)
      await monitor.fetchInitialStatus();

      // Clear the spy to track only subsequent calls
      startPollingSpy.mockClear();

      // Calling setPollingInterval (happens on WorktreeService re-sync)
      monitor.setPollingInterval(5000);

      // Should NOT start polling since pollingEnabled is false
      expect(startPollingSpy).not.toHaveBeenCalled();

      // Verify no polling happens after time passes
      const gitCallCount = vi.mocked(gitStatus.getWorktreeChangesWithStats).mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);
      expect(vi.mocked(gitStatus.getWorktreeChangesWithStats).mock.calls.length).toBe(gitCallCount);

      await monitor.stop();
    });

    it('refresh does not enable polling after fetchInitialStatus', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      const startPollingSpy = vi.spyOn(monitor as any, 'startPolling');

      // Use fetchInitialStatus (--no-watch mode)
      await monitor.fetchInitialStatus();
      startPollingSpy.mockClear();

      // Manual refresh should update status but not start polling
      await monitor.refresh();

      // Should NOT start polling
      expect(startPollingSpy).not.toHaveBeenCalled();

      // Verify no polling after refresh
      const gitCallCount = vi.mocked(gitStatus.getWorktreeChangesWithStats).mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);
      expect(vi.mocked(gitStatus.getWorktreeChangesWithStats).mock.calls.length).toBe(gitCallCount);

      await monitor.stop();
    });
  });

  describe('Metadata Update (Branch Refresh)', () => {
    it('updates state when branch changes', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Simulate a branch change (as if user ran `git checkout new-branch`)
      const updatedWorktree: Worktree = {
        ...baseWorktree,
        branch: 'new-feature-branch',
        name: 'new-feature-branch',
      };

      // Call updateMetadata with new worktree data
      monitor.updateMetadata(updatedWorktree);

      // Verify state was updated
      const state = monitor.getState();
      expect(state.branch).toBe('new-feature-branch');
      expect(state.name).toBe('new-feature-branch');

      await monitor.stop();
    });

    it('emits update event when branch changes', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Clear previous emissions and track new ones
      const emittedStates: any[] = [];
      const handler = (state: any) => {
        emittedStates.push({ ...state });
      };

      events.on('sys:worktree:update', handler);

      // Simulate a branch change
      const updatedWorktree: Worktree = {
        ...baseWorktree,
        branch: 'switched-branch',
        name: 'switched-branch',
      };

      monitor.updateMetadata(updatedWorktree);

      // Should have emitted an update
      expect(emittedStates.length).toBe(1);
      expect(emittedStates[0].branch).toBe('switched-branch');
      expect(emittedStates[0].name).toBe('switched-branch');

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });

    it('does not emit when branch has not changed', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Clear previous emissions and track new ones
      const emittedStates: any[] = [];
      const handler = (state: any) => {
        emittedStates.push({ ...state });
      };

      events.on('sys:worktree:update', handler);

      // Call updateMetadata with same branch (no change)
      const sameWorktree: Worktree = {
        ...baseWorktree,
        branch: 'feature-test', // Same as initial
        name: 'feature-test',   // Same as initial
      };

      monitor.updateMetadata(sameWorktree);

      // Should NOT emit (no change)
      expect(emittedStates.length).toBe(0);

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });

    it('handles branch change to detached HEAD (undefined branch)', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Simulate detached HEAD (branch becomes undefined)
      const detachedWorktree: Worktree = {
        ...baseWorktree,
        branch: undefined,
        name: 'HEAD detached',
      };

      monitor.updateMetadata(detachedWorktree);

      const state = monitor.getState();
      expect(state.branch).toBeUndefined();
      expect(state.name).toBe('HEAD detached');

      await monitor.stop();
    });

    it('updates only name when branch stays same but name changes', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      const emittedStates: any[] = [];
      const handler = (state: any) => {
        emittedStates.push({ ...state });
      };

      events.on('sys:worktree:update', handler);

      // Same branch, different name (edge case)
      const updatedWorktree: Worktree = {
        ...baseWorktree,
        branch: 'feature-test', // Same
        name: 'renamed-worktree', // Different
      };

      monitor.updateMetadata(updatedWorktree);

      // Should emit because name changed
      expect(emittedStates.length).toBe(1);
      expect(emittedStates[0].branch).toBe('feature-test');
      expect(emittedStates[0].name).toBe('renamed-worktree');

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });

    it('emits when only branch changes but name stays the same', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      const emittedStates: any[] = [];
      const handler = (state: any) => {
        emittedStates.push({ ...state });
      };

      events.on('sys:worktree:update', handler);

      // Different branch, same name (e.g., worktree name is path-based, not branch-based)
      const updatedWorktree: Worktree = {
        ...baseWorktree,
        branch: 'different-branch', // Different
        name: 'feature-test', // Same as initial
      };

      monitor.updateMetadata(updatedWorktree);

      // Should emit because branch changed
      expect(emittedStates.length).toBe(1);
      expect(emittedStates[0].branch).toBe('different-branch');
      expect(emittedStates[0].name).toBe('feature-test');

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });

    it('sequential updates emit only when values actually change', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      const emittedStates: any[] = [];
      const handler = (state: any) => {
        emittedStates.push({ ...state });
      };

      events.on('sys:worktree:update', handler);

      // First update: change branch
      monitor.updateMetadata({
        ...baseWorktree,
        branch: 'branch-1',
        name: 'branch-1',
      });
      expect(emittedStates.length).toBe(1);

      // Second update: change branch again
      monitor.updateMetadata({
        ...baseWorktree,
        branch: 'branch-2',
        name: 'branch-2',
      });
      expect(emittedStates.length).toBe(2);

      // Third update: same values (should not emit)
      monitor.updateMetadata({
        ...baseWorktree,
        branch: 'branch-2',
        name: 'branch-2',
      });
      expect(emittedStates.length).toBe(2); // Still 2, no new emission

      // Fourth update: change again
      monitor.updateMetadata({
        ...baseWorktree,
        branch: 'branch-3',
        name: 'branch-3',
      });
      expect(emittedStates.length).toBe(3);

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });
  });

  describe('AI Note File Polling', () => {
    it('reads AI note file content from .git directory during updates', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      // Mock file exists with content
      vi.mocked(fs.readFile).mockResolvedValue('Building feature X - running tests');

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      expect(monitor.getState().aiNote).toBe('Building feature X - running tests');

      // Verify it's looking in .git/canopy/note (namespaced path)
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('.git/canopy/note'),
        'utf-8'
      );

      await monitor.stop();
    });

    it('returns undefined when note file does not exist', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      // Mock file does not exist
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(enoentError);

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      expect(monitor.getState().aiNote).toBeUndefined();

      await monitor.stop();
    });

    it('returns undefined when note file is empty', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      // Mock file exists but is empty
      vi.mocked(fs.readFile).mockResolvedValue('   \n  ');

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      expect(monitor.getState().aiNote).toBeUndefined();

      await monitor.stop();
    });

    it('takes only last line of multi-line note', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      // Mock file with multiple lines
      vi.mocked(fs.readFile).mockResolvedValue('First line status\nSecond line details\nThird line more');

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      expect(monitor.getState().aiNote).toBe('Third line more');

      await monitor.stop();
    });

    it('truncates long note content to 500 chars', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      // Mock file with very long content
      const longContent = 'A'.repeat(600);
      vi.mocked(fs.readFile).mockResolvedValue(longContent);

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      const aiNote = monitor.getState().aiNote;
      expect(aiNote).toBeDefined();
      expect(aiNote!.length).toBe(500);
      expect(aiNote!.endsWith('...')).toBe(true);

      await monitor.stop();
    });

    it('updates aiNote in emitted state', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      vi.mocked(fs.readFile).mockResolvedValue('Test note content');

      const monitor = new WorktreeMonitor(baseWorktree);
      const emittedStates: any[] = [];
      const handler = (state: any) => {
        emittedStates.push({ ...state });
      };

      events.on('sys:worktree:update', handler);

      await monitor.start();

      // Should have emitted state with aiNote
      expect(emittedStates.length).toBeGreaterThan(0);
      expect(emittedStates[0].aiNote).toBe('Test note content');

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });

    it('can be disabled via setNoteConfig', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      vi.mocked(fs.readFile).mockResolvedValue('Should not appear');

      const monitor = new WorktreeMonitor(baseWorktree);

      // Disable note feature
      monitor.setNoteConfig(false);

      await monitor.start();

      // Should not have read the note
      expect(monitor.getState().aiNote).toBeUndefined();

      await monitor.stop();
    });

    it('uses custom filename when configured', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [],
        changedFileCount: 0,
        lastUpdated: Date.now(),
      });

      vi.mocked(fs.readFile).mockResolvedValue('Custom note content');

      const monitor = new WorktreeMonitor(baseWorktree);

      // Configure custom filename
      monitor.setNoteConfig(true, 'custom_note');

      await monitor.start();

      // Should have called readFile with the custom filename in .git directory
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('custom_note'),
        'utf-8'
      );

      await monitor.stop();
    });

    describe('Note Display Behavior', () => {
      it('shows note regardless of file age', async () => {
        vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [],
          changedFileCount: 0,
          lastUpdated: Date.now(),
        });

        // Note file exists with content
        vi.mocked(fs.readFile).mockResolvedValue('Any note content');

        const monitor = new WorktreeMonitor(baseWorktree);
        await monitor.start();

        // Should show the note (no TTL filtering)
        expect(monitor.getState().aiNote).toBe('Any note content');

        await monitor.stop();
      });

      it('updates note when content changes', async () => {
        vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [],
          changedFileCount: 0,
          lastUpdated: Date.now(),
        });

        // First call: initial note
        vi.mocked(fs.readFile).mockResolvedValueOnce('Initial note');

        const monitor = new WorktreeMonitor(baseWorktree);
        await monitor.start();

        // Should show the note
        expect(monitor.getState().aiNote).toBe('Initial note');

        // Subsequent call: note content changes
        vi.mocked(fs.readFile).mockResolvedValue('Updated note');

        // Trigger another update with different content to force re-emit
        vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
          worktreeId: baseWorktree.id,
          rootPath: baseWorktree.path,
          changes: [{ path: 'new.ts', status: 'added', insertions: 1, deletions: 0 }],
          changedFileCount: 1,
          lastUpdated: Date.now(),
        });

        await (monitor as any).updateGitStatus(true);

        // Should show the updated note
        expect(monitor.getState().aiNote).toBe('Updated note');

        await monitor.stop();
      });
    });
  });
});
