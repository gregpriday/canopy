// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAppLifecycle } from '../../src/hooks/useAppLifecycle.js';
import * as config from '../../src/utils/config.js';
import * as worktree from '../../src/utils/worktree.js';
import * as state from '../../src/utils/state.js';
import { events } from '../../src/services/events.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import type { Worktree } from '../../src/types/index.js';

// Mock modules
vi.mock('../../src/utils/config.js');
vi.mock('../../src/utils/worktree.js');
vi.mock('../../src/utils/state.js');

describe('useAppLifecycle - Worktree Auto-Refresh', () => {
  const mockWorktree1: Worktree = {
    id: '/test/main',
    path: '/test/main',
    name: 'main',
    branch: 'main',
    isCurrent: true,
  };

  const mockWorktree2: Worktree = {
    id: '/test/feature',
    path: '/test/feature',
    name: 'feature-branch',
    branch: 'feature-branch',
    isCurrent: false,
  };

  let intervalCallback: (() => Promise<void>) | null = null;
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    intervalCallback = null;

    // Default mocks - must be set up before hook renders
    vi.mocked(config.loadConfig).mockResolvedValue(DEFAULT_CONFIG);
    vi.mocked(worktree.getWorktrees).mockResolvedValue([mockWorktree1]);
    vi.mocked(state.loadInitialState).mockResolvedValue({
      worktree: mockWorktree1,
      selectedPath: null,
      expandedFolders: new Set<string>(),
    });

    // Spy on setInterval to capture the callback
    let timerIdCounter = 123;
    setIntervalSpy = vi.spyOn(global, 'setInterval').mockImplementation((cb: any, delay: number) => {
      const timerId = timerIdCounter++;
      if (delay === 10000 || delay === 5000) {
        // This is likely our worktree refresh interval
        intervalCallback = cb as () => Promise<void>;
      }
      return timerId as any;
    });

    clearIntervalSpy = vi.spyOn(global, 'clearInterval').mockImplementation(() => {
      // Just mock it, no-op
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should set up interval with default 10s refresh', async () => {
    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);
    getWorktreesSpy.mockResolvedValue([mockWorktree1]);

    const { result } = renderHook(() =>
      useAppLifecycle({ cwd: '/test', noWatch: true })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    // Verify setInterval was called with correct delay
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10000);
    expect(intervalCallback).toBeTruthy();
  });

  it('should refresh worktrees when interval callback is triggered', async () => {
    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);

    // Initial call returns one worktree
    getWorktreesSpy.mockResolvedValueOnce([mockWorktree1]);

    // After interval, return two worktrees
    getWorktreesSpy.mockResolvedValue([mockWorktree1, mockWorktree2]);

    const { result } = renderHook(() =>
      useAppLifecycle({ cwd: '/test', noWatch: true })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(result.current.worktrees).toHaveLength(1);
    expect(getWorktreesSpy).toHaveBeenCalledTimes(1);
    expect(intervalCallback).toBeTruthy();

    // Manually trigger the interval callback
    await act(async () => {
      await intervalCallback!();
    });

    // Should have refreshed worktrees
    await waitFor(() => {
      expect(result.current.worktrees).toHaveLength(2);
    });

    expect(getWorktreesSpy).toHaveBeenCalledTimes(2);
  });

  it('should not set up interval when refreshIntervalMs is 0', async () => {
    const configWithNoRefresh = {
      ...DEFAULT_CONFIG,
      worktrees: {
        enable: true,
        showInHeader: true,
        refreshIntervalMs: 0,
      },
    };

    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);
    getWorktreesSpy.mockResolvedValue([mockWorktree1]);

    const { result } = renderHook(() =>
      useAppLifecycle({
        cwd: '/test',
        initialConfig: configWithNoRefresh,
        noWatch: true,
      })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    // setInterval should not have been called for worktree refresh (no interval callback captured)
    expect(intervalCallback).toBeNull();
  });

  it('should not set up interval when refreshIntervalMs is negative', async () => {
    const configWithNegativeInterval = {
      ...DEFAULT_CONFIG,
      worktrees: {
        enable: true,
        showInHeader: true,
        refreshIntervalMs: -1,
      },
    };

    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);
    getWorktreesSpy.mockResolvedValue([mockWorktree1]);

    const { result } = renderHook(() =>
      useAppLifecycle({
        cwd: '/test',
        initialConfig: configWithNegativeInterval,
        noWatch: true,
      })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(intervalCallback).toBeNull();
  });

  it('should not set up interval when worktrees are disabled', async () => {
    const configWithDisabledWorktrees = {
      ...DEFAULT_CONFIG,
      worktrees: {
        enable: false,
        showInHeader: true,
        refreshIntervalMs: 10000,
      },
    };

    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);
    getWorktreesSpy.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useAppLifecycle({
        cwd: '/test',
        initialConfig: configWithDisabledWorktrees,
        noWatch: true,
      })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(intervalCallback).toBeNull();
  });

  it('should not set up interval when --no-git flag is set', async () => {
    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);
    getWorktreesSpy.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useAppLifecycle({ cwd: '/test', noWatch: true, noGit: true })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(intervalCallback).toBeNull();
  });

  it('should handle active worktree deletion by emitting switch event', async () => {
    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);

    // Initial: two worktrees, first is active
    getWorktreesSpy.mockResolvedValueOnce([mockWorktree1, mockWorktree2]);

    // After interval: active worktree deleted, only second remains
    getWorktreesSpy.mockResolvedValue([mockWorktree2]);

    const emitSpy = vi.spyOn(events, 'emit');

    const { result } = renderHook(() =>
      useAppLifecycle({ cwd: '/test/main', noWatch: true })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(result.current.worktrees).toHaveLength(2);
    expect(result.current.activeWorktreeId).toBe('/test/main');

    // Clear previous emit calls
    emitSpy.mockClear();

    // Manually trigger the interval callback
    await act(async () => {
      await intervalCallback!();
    });

    // Should update worktrees list
    await waitFor(() => {
      expect(result.current.worktrees).toHaveLength(1);
      expect(result.current.worktrees[0].id).toBe('/test/feature');
    });

    // Should emit switch event
    expect(emitSpy).toHaveBeenCalledWith('sys:worktree:switch', {
      worktreeId: '/test/feature',
    });

    // Should emit warning notification
    expect(emitSpy).toHaveBeenCalledWith('ui:notify', {
      type: 'warning',
      message: expect.stringContaining('Active worktree was deleted'),
    });
  });

  it('should handle non-active worktree deletion gracefully', async () => {
    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);

    // Initial: two worktrees
    getWorktreesSpy.mockResolvedValueOnce([mockWorktree1, mockWorktree2]);

    // After interval: second worktree deleted
    getWorktreesSpy.mockResolvedValue([mockWorktree1]);

    const emitSpy = vi.spyOn(events, 'emit');

    const { result } = renderHook(() =>
      useAppLifecycle({ cwd: '/test/main', noWatch: true })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(result.current.worktrees).toHaveLength(2);

    emitSpy.mockClear();

    // Manually trigger the interval callback
    await act(async () => {
      await intervalCallback!();
    });

    // Should update worktrees list
    await waitFor(() => {
      expect(result.current.worktrees).toHaveLength(1);
    });

    // Should NOT emit switch event (active worktree still exists)
    expect(emitSpy).not.toHaveBeenCalledWith('sys:worktree:switch', expect.anything());

    // Should NOT emit warning notification
    expect(emitSpy).not.toHaveBeenCalledWith('ui:notify', {
      type: 'warning',
      message: expect.stringContaining('deleted'),
    });
  });

  it('should handle refresh errors gracefully without crashing', async () => {
    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);

    // Initial call succeeds
    getWorktreesSpy.mockResolvedValueOnce([mockWorktree1]);

    // Subsequent call fails
    getWorktreesSpy.mockRejectedValue(new Error('Git command failed'));

    const { result } = renderHook(() =>
      useAppLifecycle({ cwd: '/test', noWatch: true })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(result.current.worktrees).toHaveLength(1);

    // Manually trigger the interval callback (which will error)
    await act(async () => {
      await intervalCallback!();
    });

    // Should remain in ready state, worktrees unchanged
    expect(result.current.status).toBe('ready');
    expect(result.current.worktrees).toHaveLength(1);
  });

  it('should clean up interval on unmount', async () => {
    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);
    getWorktreesSpy.mockResolvedValue([mockWorktree1]);

    const { result, unmount } = renderHook(() =>
      useAppLifecycle({ cwd: '/test', noWatch: true })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(setIntervalSpy).toHaveBeenCalled();

    // Unmount the hook
    unmount();

    // clearInterval should have been called
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('should handle manual refresh event', async () => {
    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);

    // Initial call returns one worktree
    getWorktreesSpy.mockResolvedValueOnce([mockWorktree1]);

    // Manual refresh returns two worktrees
    getWorktreesSpy.mockResolvedValue([mockWorktree1, mockWorktree2]);

    const emitSpy = vi.spyOn(events, 'emit');

    const { result } = renderHook(() =>
      useAppLifecycle({ cwd: '/test', noWatch: true })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(result.current.worktrees).toHaveLength(1);

    emitSpy.mockClear();

    // Emit manual refresh event
    await act(async () => {
      events.emit('sys:worktree:refresh');
      // Give the event handler time to complete
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Should refresh immediately
    await waitFor(() => {
      expect(result.current.worktrees).toHaveLength(2);
    });

    // Should emit success notification
    expect(emitSpy).toHaveBeenCalledWith('ui:notify', {
      type: 'success',
      message: 'Worktree list refreshed',
    });
  });

  it('should handle manual refresh errors', async () => {
    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);

    // Initial call succeeds
    getWorktreesSpy.mockResolvedValueOnce([mockWorktree1]);

    // Manual refresh fails
    getWorktreesSpy.mockRejectedValue(new Error('Git error'));

    const emitSpy = vi.spyOn(events, 'emit');

    const { result } = renderHook(() =>
      useAppLifecycle({ cwd: '/test', noWatch: true })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    emitSpy.mockClear();

    // Emit manual refresh event
    await act(async () => {
      events.emit('sys:worktree:refresh');
      // Give the event handler time to complete
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Should emit error notification
    await waitFor(() => {
      expect(emitSpy).toHaveBeenCalledWith('ui:notify', {
        type: 'error',
        message: 'Failed to refresh worktrees',
      });
    });

    // State should remain stable
    expect(result.current.status).toBe('ready');
    expect(result.current.worktrees).toHaveLength(1);
  });

  it('should support custom refresh intervals', async () => {
    intervalCallback = null; // Reset

    const configWithFastRefresh = {
      ...DEFAULT_CONFIG,
      worktrees: {
        enable: true,
        showInHeader: true,
        refreshIntervalMs: 5000, // 5 seconds
      },
    };

    const getWorktreesSpy = vi.mocked(worktree.getWorktrees);
    getWorktreesSpy.mockResolvedValue([mockWorktree1]);

    const { result } = renderHook(() =>
      useAppLifecycle({
        cwd: '/test',
        initialConfig: configWithFastRefresh,
        noWatch: true,
      })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    // Should have set up interval with 5000ms
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    expect(intervalCallback).toBeTruthy();
  });
});
