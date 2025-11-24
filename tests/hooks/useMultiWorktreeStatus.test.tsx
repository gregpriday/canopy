// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useMultiWorktreeStatus } from '../../src/hooks/useMultiWorktreeStatus.ts';
import type { Worktree } from '../../src/types/index.js';
import * as gitUtils from '../../src/utils/git.js';

vi.mock('../../src/utils/git.js');

const makeWorktree = (id: string, path: string): Worktree => ({
	id,
	path,
	name: id,
	isCurrent: false,
});

describe('useMultiWorktreeStatus', () => {
	const worktrees: Worktree[] = [
		makeWorktree('wt-1', '/repo/wt-1'),
		makeWorktree('wt-2', '/repo/wt-2'),
	];

	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllTimers();
		cleanup();
	});

	it('polls active worktree faster than background and aggregates changes', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		const callCounts = { active: 0, background: 0 };

		vi.mocked(gitUtils.getWorktreeChangesWithStats).mockImplementation(async (cwd) => {
			if (cwd.includes('wt-1')) {
				callCounts.active += 1;
				return {
					worktreeId: 'wt-1',
					rootPath: '/repo/wt-1',
					changes: [{ path: '/repo/wt-1/file.txt', status: 'modified', insertions: 5, deletions: 1 }],
					changedFileCount: 1,
					totalInsertions: 5,
					totalDeletions: 1,
					lastUpdated: Date.now(),
				};
			}
			callCounts.background += 1;
			return {
				worktreeId: 'wt-2',
				rootPath: '/repo/wt-2',
				changes: [{ path: '/repo/wt-2/other.txt', status: 'added', insertions: 3, deletions: 0 }],
				changedFileCount: 1,
				totalInsertions: 3,
				totalDeletions: 0,
				lastUpdated: Date.now(),
			};
		});

		const { result } = renderHook(() =>
			useMultiWorktreeStatus(worktrees, 'wt-1', true),
		);

		await waitFor(() => {
			expect(result.current.worktreeChanges.get('wt-1')?.changedFileCount).toBe(1);
			expect(result.current.worktreeChanges.get('wt-2')?.changedFileCount).toBe(1);
			expect(callCounts).toEqual({ active: 1, background: 1 });
		});

		// Active worktree polls at 5s, background at 60s
		vi.advanceTimersByTime(6000);

		// Active worktree should refresh again (at 5s) before background interval (60s) elapses
		await waitFor(() => {
			expect(callCounts.active).toBeGreaterThan(callCounts.background);
		});

		vi.advanceTimersByTime(55000);

		// Background worktree should now refresh (at 60s total)
		await waitFor(() => {
			expect(callCounts.background).toBeGreaterThan(1);
			expect(callCounts.active).toBeGreaterThan(callCounts.background);
		});
	});

	it('isolates errors so one failing worktree does not block others', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getWorktreeChangesWithStats).mockImplementation(async (cwd) => {
			if (cwd.includes('wt-2')) {
				throw new Error('boom');
			}
			return {
				worktreeId: 'wt-1',
				rootPath: '/repo/wt-1',
				changes: [{ path: '/repo/wt-1/file.txt', status: 'modified', insertions: 1, deletions: 0 }],
				changedFileCount: 1,
				totalInsertions: 1,
				totalDeletions: 0,
				lastUpdated: Date.now(),
			};
		});

		const { result } = renderHook(() =>
			useMultiWorktreeStatus(worktrees, 'wt-1', true),
		);

		await waitFor(() => {
			expect(result.current.worktreeChanges.get('wt-1')?.changedFileCount).toBe(1);
		});

		// Failing worktree should not crash hook or remove other entries
		expect(result.current.worktreeChanges.get('wt-2')).toBeUndefined();
	});
});
