// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMultiWorktreeStatus } from '../../src/hooks/useMultiWorktreeStatus.js';
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
	});

	it('polls active worktree faster than background and aggregates changes', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		const callCounts = { active: 0, background: 0 };

		vi.mocked(gitUtils.getGitStatusCached).mockImplementation(async (cwd) => {
			if (cwd.includes('wt-1')) {
				callCounts.active += 1;
				return new Map([['/repo/wt-1/file.txt', 'modified']]);
			}
			callCounts.background += 1;
			return new Map([['/repo/wt-2/other.txt', 'added']]);
		});

		const { result } = renderHook(() =>
			useMultiWorktreeStatus(worktrees, 'wt-1', { activeMs: 1000, backgroundMs: 20000 }, true),
		);

		await waitFor(() => {
			expect(result.current.worktreeChanges.get('wt-1')?.changedFileCount).toBe(1);
			expect(result.current.worktreeChanges.get('wt-2')?.changedFileCount).toBe(1);
			expect(callCounts).toEqual({ active: 1, background: 1 });
		});

		vi.advanceTimersByTime(1000);

		// Active worktree should refresh again before background interval elapses
		await waitFor(() => {
			expect(callCounts.active).toBeGreaterThan(callCounts.background);
		});

		vi.advanceTimersByTime(19000);

		await waitFor(() => {
			expect(callCounts.background).toBeGreaterThan(1);
			expect(callCounts.active).toBeGreaterThan(callCounts.background);
		});
	});

	it('isolates errors so one failing worktree does not block others', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockImplementation(async (cwd) => {
			if (cwd.includes('wt-2')) {
				throw new Error('boom');
			}
			return new Map([['/repo/wt-1/file.txt', 'modified']]);
		});

		const { result } = renderHook(() =>
			useMultiWorktreeStatus(worktrees, 'wt-1', { activeMs: 1000, backgroundMs: 15000 }, true),
		);

		await waitFor(() => {
			expect(result.current.worktreeChanges.get('wt-1')?.changedFileCount).toBe(1);
		});

		// Failing worktree should not crash hook or remove other entries
		expect(result.current.worktreeChanges.get('wt-2')).toBeUndefined();
	});
});
