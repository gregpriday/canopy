// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWorktreeSummaries } from '../../src/hooks/useWorktreeSummaries.js';
import type { Worktree, WorktreeChanges, WorktreeMood } from '../../src/types/index.js';
import { enrichWorktreesWithSummaries } from '../../src/services/ai/worktree.js';
import { categorizeWorktree } from '../../src/utils/worktreeMood.js';

vi.mock('../../src/services/ai/worktree.js');
vi.mock('../../src/utils/worktreeMood.js');

describe('useWorktreeSummaries', () => {
  const worktree: Worktree = {
    id: 'wt-1',
    path: '/repo/wt-1',
    name: 'feature/test',
    isCurrent: true,
  };

  const baseChanges: WorktreeChanges = {
    worktreeId: worktree.id,
    rootPath: worktree.path,
    changes: [],
    changedFileCount: 1,
    totalInsertions: 0,
    totalDeletions: 0,
    insertions: 0,
    deletions: 0,
    latestFileMtime: 1_000,
    lastUpdated: Date.now(),
  };

  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';

    vi.mocked(categorizeWorktree).mockResolvedValue('stable' as WorktreeMood);
    vi.mocked(enrichWorktreesWithSummaries).mockImplementation(
      async (worktrees, _mainBranch, onUpdate) => {
        for (const wt of worktrees) {
          wt.summaryLoading = true;
          onUpdate?.(wt);
          wt.summary = 'updated summary';
          wt.summaryLoading = false;
          onUpdate?.(wt);
        }
      }
    );
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it('avoids regenerating AI summaries when mtimes are unchanged', async () => {
    const { rerender } = renderHook(
      ({ changes }) => useWorktreeSummaries([worktree], 'main', 0, changes),
      { initialProps: { changes: new Map([[worktree.id, baseChanges]]) } }
    );

    await waitFor(() =>
      expect(enrichWorktreesWithSummaries).toHaveBeenCalledTimes(1)
    );

    const unchanged = new Map<string, WorktreeChanges>([
      [worktree.id, { ...baseChanges, lastUpdated: Date.now() }],
    ]);
    rerender({ changes: unchanged });

    await waitFor(() =>
      expect(enrichWorktreesWithSummaries).toHaveBeenCalledTimes(1)
    );

    const bumped = new Map<string, WorktreeChanges>([
      [
        worktree.id,
        { ...baseChanges, latestFileMtime: baseChanges.latestFileMtime! + 5000, lastUpdated: Date.now() },
      ],
    ]);
    rerender({ changes: bumped });

    await waitFor(() =>
      expect(enrichWorktreesWithSummaries).toHaveBeenCalledTimes(2)
    );
  });
});
