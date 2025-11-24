import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WorktreeMonitor } from '../../src/services/monitor/WorktreeMonitor.js';
import type { Worktree, FileChangeEvent } from '../../src/types/index.js';
import { events } from '../../src/services/events.js';
import * as gitStatus from '../../src/utils/git.js';
import * as fileTree from '../../src/utils/fileTree.js';
import * as fileWatcher from '../../src/utils/fileWatcher.js';

// Mock the git utilities
vi.mock('../../src/utils/git.js', () => ({
  getWorktreeChangesWithStats: vi.fn(),
  invalidateGitStatusCache: vi.fn(),
}));

// Mock fileTree utilities
vi.mock('../../src/utils/fileTree.js', async () => {
  const actual = await vi.importActual<typeof fileTree>('../../src/utils/fileTree.js');
  return {
    ...actual,
    loadGitignorePatterns: vi.fn(),
  };
});

// Spy on fileWatcher utilities (don't fully mock, just spy)
vi.mock('../../src/utils/fileWatcher.js', async () => {
  const actual = await vi.importActual<typeof fileWatcher>('../../src/utils/fileWatcher.js');
  return {
    ...actual,
    createFileWatcher: vi.fn(actual.createFileWatcher),
    buildIgnorePatterns: vi.fn(actual.buildIgnorePatterns),
  };
});

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
      const monitor = new WorktreeMonitor(baseWorktree);

      // Simulate file change event (sets green)
      const fileChanges: FileChangeEvent[] = [
        { type: 'change', path: 'foo.ts', timestamp: Date.now() },
      ];

      // Access private method using type assertion
      (monitor as any).handleFileChanges(fileChanges);

      expect(monitor.getState().trafficLight).toBe('green');

      // Advance 30 seconds
      await vi.advanceTimersByTimeAsync(30000);

      expect(monitor.getState().trafficLight).toBe('yellow');
    });

    it('transitions from yellow -> gray after 60 more seconds (90s total)', async () => {
      const monitor = new WorktreeMonitor(baseWorktree);

      const fileChanges: FileChangeEvent[] = [
        { type: 'change', path: 'foo.ts', timestamp: Date.now() },
      ];

      (monitor as any).handleFileChanges(fileChanges);

      // Advance to yellow (30s)
      await vi.advanceTimersByTimeAsync(30000);
      expect(monitor.getState().trafficLight).toBe('yellow');

      // Advance 60 more seconds (90s total)
      await vi.advanceTimersByTimeAsync(60000);

      expect(monitor.getState().trafficLight).toBe('gray');
    });

    it('resets to green on new activity from yellow state', async () => {
      const monitor = new WorktreeMonitor(baseWorktree);

      const fileChanges: FileChangeEvent[] = [
        { type: 'change', path: 'foo.ts', timestamp: Date.now() },
      ];

      (monitor as any).handleFileChanges(fileChanges);

      // Advance to yellow state (40s)
      await vi.advanceTimersByTimeAsync(40000);
      expect(monitor.getState().trafficLight).toBe('yellow');

      // New change happens
      const newChanges: FileChangeEvent[] = [
        { type: 'change', path: 'bar.ts', timestamp: Date.now() },
      ];

      (monitor as any).handleFileChanges(newChanges);

      // Should reset to green
      expect(monitor.getState().trafficLight).toBe('green');
    });

    it('does NOT trigger green on deletion-only events (spec requirement)', async () => {
      const monitor = new WorktreeMonitor(baseWorktree);

      // Initial state should be gray
      expect(monitor.getState().trafficLight).toBe('gray');

      // Deletion event
      const deletionEvents: FileChangeEvent[] = [
        { type: 'unlink', path: 'deleted.ts', timestamp: Date.now() },
      ];

      (monitor as any).handleFileChanges(deletionEvents);

      // Should remain gray (deletions don't trigger traffic light)
      expect(monitor.getState().trafficLight).toBe('gray');
    });

    it('triggers green if batch contains ANY non-deletion event', async () => {
      const monitor = new WorktreeMonitor(baseWorktree);

      // Mixed batch: deletion + modification
      const mixedEvents: FileChangeEvent[] = [
        { type: 'unlink', path: 'deleted.ts', timestamp: Date.now() },
        { type: 'change', path: 'modified.ts', timestamp: Date.now() },
      ];

      (monitor as any).handleFileChanges(mixedEvents);

      // Should turn green (contains non-deletion)
      expect(monitor.getState().trafficLight).toBe('green');
    });
  });

  describe('AI Summary Debouncing & Bypass', () => {
    it('debounces AI summary generation for dirty worktrees', async () => {
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
      const updateAISpy = vi.spyOn(monitor as any, 'updateAISummary');

      // Start the monitor (triggers initial git status)
      await monitor.start();

      // Trigger file change
      const fileChanges: FileChangeEvent[] = [
        { type: 'change', path: 'test.ts', timestamp: Date.now() },
      ];

      (monitor as any).handleFileChanges(fileChanges);

      // 1 second later: Git status updates, but AI shouldn't run yet
      await vi.advanceTimersByTimeAsync(1000);

      // AI should not have been called yet (debounced for 10s)
      expect(updateAISpy).not.toHaveBeenCalled();

      // 10 seconds later: AI should run
      await vi.advanceTimersByTimeAsync(10000);

      // Now AI should have been triggered
      // Note: This may be called during start() + after debounce
      expect(updateAISpy).toHaveBeenCalled();

      await monitor.stop();
    });

    it('bypasses AI debounce when reverting to clean state', async () => {
      // Start with dirty state
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
      const updateCleanSpy = vi.spyOn(monitor as any, 'updateCleanSummary');

      await monitor.start();

      // Set dirty state
      (monitor as any).state.modifiedCount = 1;

      // Trigger git status update (will detect clean state)
      await (monitor as any).updateGitStatus();

      // updateCleanSummary should be called immediately (no debounce)
      expect(updateCleanSpy).toHaveBeenCalled();

      await monitor.stop();
    });

    it('cancels pending AI debounce when transitioning to clean', async () => {
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
          changes: [],
          changedFileCount: 0,
          lastUpdated: Date.now(),
        });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Trigger change (starts AI debounce)
      const fileChanges: FileChangeEvent[] = [
        { type: 'change', path: 'test.ts', timestamp: Date.now() },
      ];

      (monitor as any).handleFileChanges(fileChanges);

      // After 5 seconds (before 10s AI debounce completes), worktree becomes clean
      await vi.advanceTimersByTimeAsync(5000);

      // Manually set state to dirty first
      (monitor as any).state.modifiedCount = 1;

      // Now transition to clean
      await (monitor as any).updateGitStatus();

      // Summary should show clean state (last commit)
      expect(monitor.getState().summary).toContain('✅');

      await monitor.stop();
    });
  });

  describe('Polling-Only Mode Support', () => {
    it('triggers AI update when polling detects new dirty changes', async () => {
      // Mock git status: first clean, then dirty
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
          changes: [{ path: 'new.ts', status: 'modified', insertions: 5, deletions: 0 }],
          changedFileCount: 1,
          totalInsertions: 5,
          totalDeletions: 0,
          latestFileMtime: Date.now(),
          lastUpdated: Date.now(),
        });

      const monitor = new WorktreeMonitor(baseWorktree);
      const aiDebouncedSpy = vi.spyOn(monitor as any, 'aiSummaryDebounced');

      await monitor.start();

      // Polling detects changes (simulate next poll cycle)
      await (monitor as any).updateGitStatus();

      // AI debounced should be called
      expect(aiDebouncedSpy).toHaveBeenCalled();

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

    it('uses debounced AI generation for dirty worktrees on startup', async () => {
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
      const aiDebouncedSpy = vi.spyOn(monitor as any, 'aiSummaryDebounced');

      await monitor.start();

      // Should trigger debounced AI (not immediate)
      expect(aiDebouncedSpy).toHaveBeenCalled();

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

      // Second update with renamed file
      await (monitor as any).updateGitStatus();

      // Should emit because file list changed (rename detected)
      expect(emitCount).toBeGreaterThan(firstEmitCount);

      events.off('sys:worktree:update', handler);
      await monitor.stop();
    });
  });

  describe('State Marking & Retry', () => {
    it('only marks state as processed after successful AI generation', async () => {
      vi.mocked(gitStatus.getWorktreeChangesWithStats).mockResolvedValue({
        worktreeId: baseWorktree.id,
        rootPath: baseWorktree.path,
        changes: [{ path: 'test.ts', status: 'modified', insertions: 10, deletions: 2 }],
        changedFileCount: 1,
        totalInsertions: 10,
        totalDeletions: 2,
        latestFileMtime: 12345,
        lastUpdated: Date.now(),
      });

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Check that lastProcessedMtime is updated after AI generation
      const initialMtime = (monitor as any).lastProcessedMtime;

      // Force AI update
      await (monitor as any).updateAISummary(true);

      const updatedMtime = (monitor as any).lastProcessedMtime;

      // Should have been updated after successful generation
      expect(updatedMtime).toBeDefined();

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

  describe('Ignore Pattern Application (Issue #186)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Default: mock loadGitignorePatterns to return empty array
      vi.mocked(fileTree.loadGitignorePatterns).mockResolvedValue([]);
    });

    it('loads gitignore patterns when starting file watcher', async () => {
      vi.mocked(fileTree.loadGitignorePatterns).mockResolvedValue([
        'node_modules/',
        '*.log',
      ]);

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Should have called loadGitignorePatterns with worktree path
      expect(fileTree.loadGitignorePatterns).toHaveBeenCalledWith(baseWorktree.path);

      await monitor.stop();
    });

    it('passes ignore patterns to createFileWatcher', async () => {
      vi.mocked(fileTree.loadGitignorePatterns).mockResolvedValue([
        'node_modules/',
        'dist/',
      ]);

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Should have called buildIgnorePatterns with gitignore patterns
      expect(fileWatcher.buildIgnorePatterns).toHaveBeenCalledWith([
        'node_modules/',
        'dist/',
      ]);

      // Should have called createFileWatcher with ignored patterns
      expect(fileWatcher.createFileWatcher).toHaveBeenCalledWith(
        baseWorktree.path,
        expect.objectContaining({
          ignored: expect.arrayContaining([
            '**/node_modules/**',
            '**/.git/**',
          ]),
        })
      );

      await monitor.stop();
    });

    it('combines standard ignores with gitignore patterns', async () => {
      vi.mocked(fileTree.loadGitignorePatterns).mockResolvedValue([
        'custom-build/',
        '*.secret',
      ]);

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // buildIgnorePatterns should be called with gitignore patterns
      expect(fileWatcher.buildIgnorePatterns).toHaveBeenCalledWith([
        'custom-build/',
        '*.secret',
      ]);

      // Result should include both standard and custom patterns
      const call = vi.mocked(fileWatcher.createFileWatcher).mock.calls[0];
      const ignoredPatterns = call[1].ignored as string[];

      expect(ignoredPatterns).toContain('**/node_modules/**');
      expect(ignoredPatterns).toContain('**/.git/**');
      expect(ignoredPatterns).toContain('custom-build/');
      expect(ignoredPatterns).toContain('*.secret');

      await monitor.stop();
    });

    it('handles missing .gitignore file gracefully', async () => {
      // loadGitignorePatterns returns empty array when .gitignore doesn't exist
      vi.mocked(fileTree.loadGitignorePatterns).mockResolvedValue([]);

      const monitor = new WorktreeMonitor(baseWorktree);
      await monitor.start();

      // Should still work with just standard ignores
      expect(fileWatcher.buildIgnorePatterns).toHaveBeenCalledWith([]);

      const call = vi.mocked(fileWatcher.createFileWatcher).mock.calls[0];
      const ignoredPatterns = call[1].ignored as string[];

      // Should still have standard ignores
      expect(ignoredPatterns).toContain('**/node_modules/**');
      expect(ignoredPatterns).toContain('**/.git/**');

      await monitor.stop();
    });

    it('continues with polling if file watcher creation fails', async () => {
      // Simulate failure creating file watcher (more realistic than gitignore failure)
      vi.mocked(fileWatcher.createFileWatcher).mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      const monitor = new WorktreeMonitor(baseWorktree);

      // Should not throw - should continue with polling fallback
      await expect(monitor.start()).resolves.not.toThrow();

      // Verify that loadGitignorePatterns was still called
      expect(fileTree.loadGitignorePatterns).toHaveBeenCalled();

      await monitor.stop();
    });
  });
});
