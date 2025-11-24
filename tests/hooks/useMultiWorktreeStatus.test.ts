// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useMultiWorktreeStatus } from '../../src/hooks/useMultiWorktreeStatus.ts';
import * as gitUtils from '../../src/utils/git.js';
import type { Worktree } from '../../src/types/index.js';

vi.mock('../../src/utils/git.js');

describe('useMultiWorktreeStatus Stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    cleanup();
  });

  const mockWorktree: Worktree = {
    id: 'wt1',
    path: '/p',
    name: 'main',
    branch: 'main',
    isCurrent: true,
  };

  it('Maintains reference equality when git status data is unchanged', async () => {
    // Mock stable git return
    const mockChanges = {
      worktreeId: 'wt1',
      rootPath: '/p',
      changes: [],
      changedFileCount: 1,
      latestFileMtime: 500,
      totalInsertions: 5,
      totalDeletions: 0,
      insertions: 5,
      deletions: 0,
      lastUpdated: Date.now(),
    };

    vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
    vi.mocked(gitUtils.getWorktreeChangesWithStats).mockResolvedValue(mockChanges);

    const { result } = renderHook(() =>
      useMultiWorktreeStatus([mockWorktree], 'wt1', true)
    );

    // Wait for first load
    await waitFor(() => {
      expect(result.current.worktreeChanges.size).toBeGreaterThan(0);
    });

    const mapReference1 = result.current.worktreeChanges;
    const data1 = mapReference1.get('wt1');

    // Trigger Refresh with same data
    await act(async () => {
      result.current.refresh();
      await new Promise(r => setTimeout(r, 100));
    });

    const mapReference2 = result.current.worktreeChanges;

    // The Map reference should be the SAME because equality check prevented state update
    expect(mapReference1).toBe(mapReference2);

    // And the data should be the same
    const data2 = mapReference2.get('wt1');
    expect(data1).toEqual(data2);
  });

  it('Updates reference when git status data changes', async () => {
    const mockChanges1 = {
      worktreeId: 'wt1',
      rootPath: '/p',
      changes: [],
      changedFileCount: 1,
      latestFileMtime: 500,
      totalInsertions: 5,
      totalDeletions: 0,
      insertions: 5,
      deletions: 0,
      lastUpdated: Date.now(),
    };

    vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
    vi.mocked(gitUtils.getWorktreeChangesWithStats).mockResolvedValue(mockChanges1);

    const { result } = renderHook(() =>
      useMultiWorktreeStatus([mockWorktree], 'wt1', true)
    );

    // Wait for first load
    await waitFor(() => {
      expect(result.current.worktreeChanges.size).toBeGreaterThan(0);
    });

    const mapReference1 = result.current.worktreeChanges;

    // Change the mock data (file count changed)
    const mockChanges2 = {
      ...mockChanges1,
      changedFileCount: 2,
      latestFileMtime: 600,
    };
    vi.mocked(gitUtils.getWorktreeChangesWithStats).mockResolvedValue(mockChanges2);

    // Trigger Refresh
    await act(async () => {
      result.current.refresh(undefined, true);
      await new Promise(r => setTimeout(r, 100));
    });

    const mapReference2 = result.current.worktreeChanges;

    // The Map reference should be DIFFERENT because data changed
    expect(mapReference1).not.toBe(mapReference2);

    // And the new data should reflect changes
    const data2 = mapReference2.get('wt1');
    expect(data2?.changedFileCount).toBe(2);
    expect(data2?.latestFileMtime).toBe(600);
  });

  it('Handles multiple worktrees independently', async () => {
    const worktree1: Worktree = {
      id: 'wt1',
      path: '/p1',
      name: 'main',
      branch: 'main',
      isCurrent: true,
    };

    const worktree2: Worktree = {
      id: 'wt2',
      path: '/p2',
      name: 'feature',
      branch: 'feature',
      isCurrent: false,
    };

    vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
    vi.mocked(gitUtils.getWorktreeChangesWithStats).mockImplementation(async (path) => {
      if (path === '/p1') {
        return {
          worktreeId: 'wt1',
          rootPath: '/p1',
          changes: [],
          changedFileCount: 1,
          latestFileMtime: 100,
          totalInsertions: 5,
          totalDeletions: 0,
          insertions: 5,
          deletions: 0,
          lastUpdated: Date.now(),
        };
      }
      return {
        worktreeId: 'wt2',
        rootPath: '/p2',
        changes: [],
        changedFileCount: 2,
        latestFileMtime: 200,
        totalInsertions: 10,
        totalDeletions: 3,
        insertions: 10,
        deletions: 3,
        lastUpdated: Date.now(),
      };
    });

    const { result } = renderHook(() =>
      useMultiWorktreeStatus([worktree1, worktree2], 'wt1', true)
    );

    // Wait for both to load
    await waitFor(() => {
      expect(result.current.worktreeChanges.size).toBe(2);
    });

    // Verify both worktrees have data
    const wt1Data = result.current.worktreeChanges.get('wt1');
    const wt2Data = result.current.worktreeChanges.get('wt2');

    expect(wt1Data?.changedFileCount).toBe(1);
    expect(wt2Data?.changedFileCount).toBe(2);
  });

  it('Clears data when clear() is called', async () => {
    vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
    vi.mocked(gitUtils.getWorktreeChangesWithStats).mockResolvedValue({
      worktreeId: 'wt1',
      rootPath: '/p',
      changes: [],
      changedFileCount: 1,
      latestFileMtime: 500,
      totalInsertions: 5,
      totalDeletions: 0,
      insertions: 5,
      deletions: 0,
      lastUpdated: Date.now(),
    });

    const { result } = renderHook(() =>
      useMultiWorktreeStatus([mockWorktree], 'wt1', true)
    );

    // Wait for load
    await waitFor(() => {
      expect(result.current.worktreeChanges.size).toBeGreaterThan(0);
    });

    // Clear
    act(() => {
      result.current.clear();
    });

    // Should be empty
    expect(result.current.worktreeChanges.size).toBe(0);
  });
});
