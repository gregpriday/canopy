// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useRepositoryStats } from '../../src/hooks/useRepositoryStats.ts';
import * as gitUtils from '../../src/utils/git.js';
import * as githubUtils from '../../src/utils/github.js';
import { events } from '../../src/services/events.js';

vi.mock('../../src/utils/git.js');
vi.mock('../../src/utils/github.js');

describe('useRepositoryStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Default mocks
    vi.mocked(gitUtils.getCommitCount).mockResolvedValue(42);
    vi.mocked(githubUtils.getRepoStats).mockResolvedValue({ stats: { issueCount: 5, prCount: 3 } });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    cleanup();
  });

  describe('Initial fetch', () => {
    it('fetches stats on mount', async () => {
      const { result } = renderHook(() => useRepositoryStats('/test/path'));

      // Initially loading
      expect(result.current.loading).toBe(true);

      // Let the initial fetch complete
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.commitCount).toBe(42);
      expect(result.current.issueCount).toBe(5);
      expect(result.current.prCount).toBe(3);
    });

    it('handles GitHub CLI unavailable gracefully', async () => {
      vi.mocked(githubUtils.getRepoStats).mockResolvedValue({ stats: null, error: 'gh CLI not installed' });

      const { result } = renderHook(() => useRepositoryStats('/test/path'));

      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.commitCount).toBe(42);
      expect(result.current.issueCount).toBe(null);
      expect(result.current.prCount).toBe(null);
      expect(result.current.ghError).toBe('gh CLI not installed');
    });

    it('handles fetch errors gracefully', async () => {
      vi.mocked(gitUtils.getCommitCount).mockRejectedValue(new Error('Git error'));

      const { result } = renderHook(() => useRepositoryStats('/test/path'));

      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      // Should not crash, just mark as not loading
      expect(result.current.loading).toBe(false);
    });
  });

  describe('Adaptive polling', () => {
    it('uses active interval (30s) when recently active', async () => {
      const { result } = renderHook(() => useRepositoryStats('/test/path'));

      // Initial fetch
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      vi.mocked(gitUtils.getCommitCount).mockClear();

      // Advance 30 seconds (active interval)
      await act(async () => {
        vi.advanceTimersByTime(30000);
        await vi.runOnlyPendingTimersAsync();
      });

      // Should have fetched again at 30s interval
      expect(gitUtils.getCommitCount).toHaveBeenCalled();
    });

    it('continues polling at regular intervals', async () => {
      const { result } = renderHook(() => useRepositoryStats('/test/path'));

      // Initial fetch
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      // Count fetches over time - each 30s interval should trigger
      const fetchCounts: number[] = [];

      for (let i = 0; i < 4; i++) {
        vi.mocked(gitUtils.getCommitCount).mockClear();
        await act(async () => {
          vi.advanceTimersByTime(30000);
          await vi.runOnlyPendingTimersAsync();
        });
        fetchCounts.push(vi.mocked(gitUtils.getCommitCount).mock.calls.length);
      }

      // Should have had fetches at each 30s interval (active mode)
      expect(fetchCounts.every(c => c >= 1)).toBe(true);
    });
  });

  describe('Event handling', () => {
    it('triggers immediate fetch on sys:refresh event', async () => {
      const { result } = renderHook(() => useRepositoryStats('/test/path'));

      // Initial fetch
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      vi.mocked(gitUtils.getCommitCount).mockClear();
      vi.mocked(gitUtils.getCommitCount).mockResolvedValue(50);

      // Emit refresh event
      await act(async () => {
        events.emit('sys:refresh');
        await vi.runOnlyPendingTimersAsync();
      });

      // Should have fetched immediately
      expect(gitUtils.getCommitCount).toHaveBeenCalled();
      expect(result.current.commitCount).toBe(50);
    });

    it('boosts activity timestamp on watcher:change event', async () => {
      const { result } = renderHook(() => useRepositoryStats('/test/path'));

      // Initial fetch
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      // Verify initial fetch completed
      expect(result.current.loading).toBe(false);
      expect(result.current.commitCount).toBe(42);

      // Emit watcher change to boost activity
      await act(async () => {
        events.emit('watcher:change', { type: 'change', path: '/test/file.ts' });
      });

      // Clear mocks and advance to next poll cycle
      vi.mocked(gitUtils.getCommitCount).mockClear();
      vi.mocked(gitUtils.getCommitCount).mockResolvedValue(55);

      await act(async () => {
        vi.advanceTimersByTime(30000);
        await vi.runOnlyPendingTimersAsync();
      });

      // Verify fetch happened (activity boosted so still using active interval)
      expect(gitUtils.getCommitCount).toHaveBeenCalled();
      expect(result.current.commitCount).toBe(55);
    });

    it('handles pending refresh during active fetch', async () => {
      // Make fetch take time
      let fetchResolve: () => void;
      vi.mocked(gitUtils.getCommitCount).mockImplementation(() =>
        new Promise<number>((resolve) => {
          fetchResolve = () => resolve(42);
        })
      );

      const { result } = renderHook(() => useRepositoryStats('/test/path'));

      // Start initial fetch (pending)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Trigger manual refresh while fetch is pending - should be queued
      await act(async () => {
        events.emit('sys:refresh');
      });

      // Only one fetch should be in progress
      expect(gitUtils.getCommitCount).toHaveBeenCalledTimes(1);

      // Complete the pending fetch - should trigger the queued refresh
      vi.mocked(gitUtils.getCommitCount).mockClear();
      vi.mocked(gitUtils.getCommitCount).mockResolvedValue(50);

      await act(async () => {
        fetchResolve!();
        await vi.runOnlyPendingTimersAsync();
      });

      // The pending refresh should have been executed
      expect(gitUtils.getCommitCount).toHaveBeenCalled();
    });
  });

  describe('Concurrent fetch prevention', () => {
    it('prevents concurrent fetches', async () => {
      // Make fetch take time
      let fetchResolve: () => void;
      const fetchPromise = new Promise<number>((resolve) => {
        fetchResolve = () => resolve(42);
      });
      vi.mocked(gitUtils.getCommitCount).mockReturnValue(fetchPromise);

      const { result } = renderHook(() => useRepositoryStats('/test/path'));

      // Start initial fetch (pending)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Trigger manual refresh while fetch is pending
      await act(async () => {
        events.emit('sys:refresh');
      });

      // Only one fetch should be in progress
      expect(gitUtils.getCommitCount).toHaveBeenCalledTimes(1);

      // Complete the pending fetch
      await act(async () => {
        fetchResolve!();
        await vi.runOnlyPendingTimersAsync();
      });
    });
  });

  describe('Enabled flag', () => {
    it('does not fetch when disabled', async () => {
      const { result } = renderHook(() => useRepositoryStats('/test/path', false));

      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      // Should not have fetched
      expect(gitUtils.getCommitCount).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
    });
  });
});
