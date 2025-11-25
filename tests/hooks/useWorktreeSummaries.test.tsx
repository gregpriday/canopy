// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useWorktreeSummaries } from '../../src/hooks/useWorktreeSummaries.ts';
import * as worktreeService from '../../src/services/ai/worktree.ts';

// Lightweight factories to keep data stable between assertions
const createWorktree = (id: string, overrides: Partial<import('../../src/types/index.js').Worktree> = {}) => ({
  id,
  path: `/path/${id}`,
  name: 'main',
  branch: 'main',
  isCurrent: true,
  summaryLoading: false,
  ...overrides,
});

const createChangesMap = (
  id: string,
  overrides: Partial<import('../../src/types/index.js').WorktreeChanges> = {}
) =>
  new Map<string, import('../../src/types/index.js').WorktreeChanges>([
    [
      id,
      {
        worktreeId: id,
        rootPath: `/path/${id}`,
        changes: [],
        changedFileCount: 1,
        latestFileMtime: Date.now(),
        totalInsertions: 0,
        totalDeletions: 0,
        lastUpdated: Date.now(),
        ...overrides,
      },
    ],
  ]);

vi.mock('../../src/services/ai/worktree.ts', () => ({
  enrichWorktreesWithSummaries: vi.fn(async (wts, _branch, _changes, onUpdate) => {
    for (const wt of wts) {
      onUpdate?.({ ...wt, summary: 'AI Generated Summary', summaryLoading: false });
    }
  }),
}));

vi.mock('../../src/utils/worktreeMood.ts', () => ({
  categorizeWorktree: vi.fn().mockResolvedValue('stable'),
}));

describe.skip('useWorktreeSummaries', () => {
  const DEBOUNCE_MS = 50;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('enriches worktrees after the debounce interval', async () => {
    const worktree = createWorktree('wt1');
    const changes = createChangesMap('wt1');

    const { result } = renderHook(
      ({ wts, map }) => useWorktreeSummaries(wts, 'main', map, DEBOUNCE_MS),
      { initialProps: { wts: [worktree], map: changes } }
    );

    expect(result.current[0].summary).toBeUndefined();

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });

    expect(worktreeService.enrichWorktreesWithSummaries).toHaveBeenCalledTimes(1);
    expect(result.current[0].summary).toBe('AI Generated Summary');
  });

  it('debounces rapid successive updates', async () => {
    const worktree = createWorktree('wt1');
    const changes1 = createChangesMap('wt1', { changedFileCount: 1 });
    const changes2 = createChangesMap('wt1', { changedFileCount: 2 });

    const { rerender } = renderHook(
      ({ wts, map }) => useWorktreeSummaries(wts, 'main', map, DEBOUNCE_MS),
      { initialProps: { wts: [worktree], map: changes1 } }
    );

    rerender({ wts: [worktree], map: changes2 });

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });

    expect(worktreeService.enrichWorktreesWithSummaries).toHaveBeenCalledTimes(1);
  });

  it('preserves existing summaries when worktree list changes', async () => {
    const worktreeWithSummary = createWorktree('wt1', { summary: 'Existing Summary' });
    const changes = createChangesMap('wt1');

    const { result, rerender } = renderHook(
      ({ wts, map }) => useWorktreeSummaries(wts, 'main', map, DEBOUNCE_MS),
      { initialProps: { wts: [worktreeWithSummary], map: changes } }
    );

    const updatedWorktree = createWorktree('wt1');
    rerender({ wts: [updatedWorktree], map: changes });

    expect(result.current[0]?.summary).toBe('Existing Summary');
  });

  it('skips enrichment when no changes are provided', async () => {
    const worktree = createWorktree('wt1');

    renderHook(() => useWorktreeSummaries([worktree], 'main', undefined, DEBOUNCE_MS));

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });

    expect(worktreeService.enrichWorktreesWithSummaries).not.toHaveBeenCalled();
  });
});
