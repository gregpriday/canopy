// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useWorktreeSummaries } from '../../src/hooks/useWorktreeSummaries.ts';
import * as worktreeService from '../../src/services/ai/worktree.ts';
import * as worktreeMood from '../../src/utils/worktreeMood.ts';
import type { Worktree, WorktreeChanges } from '../../src/types/index.js';

// Mock the heavy service layer
vi.mock('../../src/services/ai/worktree.ts');
vi.mock('../../src/utils/worktreeMood.ts');

describe('useWorktreeSummaries Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Default mock for enrichWorktreesWithSummaries
    vi.mocked(worktreeService.enrichWorktreesWithSummaries).mockImplementation(
      async (worktrees, _mainBranch, _changes, onUpdate) => {
        // Simulate immediate enrichment
        for (const wt of worktrees) {
          if (onUpdate) {
            onUpdate({
              ...wt,
              summary: 'Test Summary',
              summaryLoading: false,
            });
          }
        }
      }
    );

    // Default mock for categorizeWorktree
    vi.mocked(worktreeMood.categorizeWorktree).mockResolvedValue('stable');
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('CRITICAL: Does NOT reset timer when upstream data refreshes but is identical', async () => {
    const enrichSpy = vi.spyOn(worktreeService, 'enrichWorktreesWithSummaries');

    const changes1 = new Map<string, WorktreeChanges>([
      [
        'wt1',
        {
          worktreeId: 'wt1',
          rootPath: '/p',
          changes: [],
          changedFileCount: 1,
          latestFileMtime: 100,
          totalInsertions: 5,
          totalDeletions: 0,
          lastUpdated: Date.now(),
        },
      ],
    ]);

    // 1. Initial Render
    const { rerender } = renderHook(
      ({ changes }) => useWorktreeSummaries([mockWorktree], 'main', changes),
      {
        initialProps: { changes: changes1 },
      }
    );

    // Reset spy after initial render effects
    enrichSpy.mockClear();

    // 2. Advance time partially (10s)
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // 3. Rerender with NEW OBJECT but SAME DATA (simulating WorktreeMonitor poll)
    const changes2 = new Map<string, WorktreeChanges>([
      [
        'wt1',
        {
          worktreeId: 'wt1',
          rootPath: '/p',
          changes: [],
          changedFileCount: 1,
          latestFileMtime: 100,
          totalInsertions: 5,
          totalDeletions: 0,
          lastUpdated: Date.now(),
        },
      ],
    ]);

    rerender({ changes: changes2 });

    // 4. Advance remaining time (20s + buffer)
    await act(async () => {
      vi.advanceTimersByTime(21000);
    });

    // If the timer WAS NOT reset, this should have fired once after 30s total
    // If the timer WAS reset, it would fire at 40s (10 + 30), so at 31s it wouldn't be called yet.
    expect(enrichSpy).toHaveBeenCalledTimes(1);
  });

  it('CRITICAL: Bypasses debounce immediately when transitioning Dirty -> Clean', async () => {
    const enrichSpy = vi.spyOn(worktreeService, 'enrichWorktreesWithSummaries');

    const dirtyChanges = new Map<string, WorktreeChanges>([
      [
        'wt1',
        {
          worktreeId: 'wt1',
          rootPath: '/p',
          changes: [],
          changedFileCount: 1,
          latestFileMtime: 100,
          totalInsertions: 5,
          totalDeletions: 0,
          lastUpdated: Date.now(),
        },
      ],
    ]);

    // 1. Start Dirty
    const { rerender } = renderHook(
      ({ changes }) => useWorktreeSummaries([mockWorktree], 'main', changes),
      {
        initialProps: { changes: dirtyChanges },
      }
    );

    // Clear calls from initial render
    enrichSpy.mockClear();

    // 2. Update to Clean (0 files)
    const cleanChanges = new Map<string, WorktreeChanges>([
      [
        'wt1',
        {
          worktreeId: 'wt1',
          rootPath: '/p',
          changes: [],
          changedFileCount: 0,
          latestFileMtime: 0,
          totalInsertions: 0,
          totalDeletions: 0,
          lastUpdated: Date.now(),
        },
      ],
    ]);

    await act(async () => {
      rerender({ changes: cleanChanges });
      // Run any pending microtasks
      await Promise.resolve();
    });

    // 3. Verify Immediate Call (no timer advancement needed)
    expect(enrichSpy).toHaveBeenCalled();
  });

  it('Filters out worktrees with no changes data', async () => {
    const enrichSpy = vi.spyOn(worktreeService, 'enrichWorktreesWithSummaries');

    // Render with undefined changes
    renderHook(() => useWorktreeSummaries([mockWorktree], 'main', undefined));

    // Clear initial calls
    enrichSpy.mockClear();

    // Advance timer
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    // Should not have been called because no changes data
    expect(enrichSpy).not.toHaveBeenCalled();
  });

  it('Updates state when enrichment completes', async () => {
    const changes = new Map<string, WorktreeChanges>([
      [
        'wt1',
        {
          worktreeId: 'wt1',
          rootPath: '/p',
          changes: [],
          changedFileCount: 1,
          latestFileMtime: 100,
          totalInsertions: 5,
          totalDeletions: 0,
          lastUpdated: Date.now(),
        },
      ],
    ]);

    const { result } = renderHook(() =>
      useWorktreeSummaries([mockWorktree], 'main', changes)
    );

    // Advance timer to trigger enrichment
    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
    });

    // Verify enriched state
    expect(result.current[0]).toMatchObject({
      id: 'wt1',
      summary: 'Test Summary',
    });
  });

  it('Preserves existing summaries when worktrees list updates', () => {
    const changes = new Map<string, WorktreeChanges>([
      [
        'wt1',
        {
          worktreeId: 'wt1',
          rootPath: '/p',
          changes: [],
          changedFileCount: 0,
          latestFileMtime: 0,
          totalInsertions: 0,
          totalDeletions: 0,
          lastUpdated: Date.now(),
        },
      ],
    ]);

    const { result, rerender } = renderHook(
      ({ wts }) => useWorktreeSummaries(wts, 'main', changes),
      {
        initialProps: {
          wts: [{ ...mockWorktree, summary: 'Existing Summary' }],
        },
      }
    );

    // Rerender with updated worktree (but no summary)
    rerender({ wts: [mockWorktree] });

    // Should preserve the existing summary
    expect(result.current[0]?.summary).toBe('Existing Summary');
  });
});
