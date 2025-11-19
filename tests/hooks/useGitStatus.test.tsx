// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useGitStatus } from '../../src/hooks/useGitStatus.js';
import * as gitUtils from '../../src/utils/git.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// Mock git utilities
vi.mock('../../src/utils/git.js');

describe('useGitStatus', () => {
	let testRepoPath: string;
	let nonRepoPath: string;

	beforeEach(async () => {
		// Create temp directories
		testRepoPath = path.join(os.tmpdir(), `canopy-hook-test-${Date.now()}`);
		nonRepoPath = path.join(os.tmpdir(), `canopy-non-hook-${Date.now()}`);

		await fs.ensureDir(testRepoPath);
		await fs.ensureDir(nonRepoPath);

		// Set up mocks
		vi.clearAllMocks();
		// Don't use fake timers globally - only in specific tests that need them
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		vi.useRealTimers(); // Ensure we're back to real timers after each test
		await fs.remove(testRepoPath);
		await fs.remove(nonRepoPath);
	});

	it('initializes with empty git status', () => {
		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		expect(result.current.gitStatus).toBeInstanceOf(Map);
		expect(result.current.gitStatus.size).toBe(0);
		expect(result.current.gitEnabled).toBe(false);
		expect(typeof result.current.refresh).toBe('function');
	});

	it('loads git status on mount for git repository', async () => {
		// Mock: is a git repo with one modified file
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(
			new Map([['src/App.tsx', 'modified']])
		);

		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		// Wait for async fetch to complete
		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(true);
		});

		expect(result.current.gitStatus.size).toBe(1);
		expect(result.current.gitStatus.get('src/App.tsx')).toBe('modified');
	});

	it('handles non-git directory gracefully', async () => {
		// Mock: not a git repo
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(false);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(new Map());

		const { result } = renderHook(() => useGitStatus(nonRepoPath, true));

		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(false);
		});

		expect(result.current.gitStatus.size).toBe(0);
	});

	it('does not fetch when enabled=false', async () => {
		const { result } = renderHook(() => useGitStatus(testRepoPath, false));

		// Wait a bit to ensure no async calls
		await new Promise(resolve => setTimeout(resolve, 50));

		expect(gitUtils.isGitRepository).not.toHaveBeenCalled();
		expect(gitUtils.getGitStatusCached).not.toHaveBeenCalled();
		expect(result.current.gitEnabled).toBe(false);
		expect(result.current.gitStatus.size).toBe(0);
	});

	it('refresh() updates git status', async () => {
		// Initial state: one modified file
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(
			new Map([['file1.txt', 'modified']])
		);

		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		await waitFor(() => {
			expect(result.current.gitStatus.size).toBe(1);
		});

		// Mock updated status: two files
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(
			new Map([
				['file1.txt', 'modified'],
				['file2.txt', 'added'],
			])
		);

		// Call refresh - it will debounce for 100ms with real timers
		result.current.refresh();

		// Wait for debounce + fetch to complete
		await waitFor(() => {
			expect(result.current.gitStatus.size).toBe(2);
		}, { timeout: 1000 });

		expect(result.current.gitStatus.get('file2.txt')).toBe('added');
	});

	it('debounces rapid refresh calls', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(new Map());

		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(true);
		});

		// Clear mock calls from initial load
		vi.clearAllMocks();

		// Call refresh 5 times rapidly
		result.current.refresh();
		result.current.refresh();
		result.current.refresh();
		result.current.refresh();
		result.current.refresh();

		// Wait for debounce to complete
		await waitFor(() => {
			expect(gitUtils.getGitStatusCached).toHaveBeenCalled();
		}, { timeout: 500 });

		// Should only call getGitStatusCached ONCE (debounced)
		expect(gitUtils.getGitStatusCached).toHaveBeenCalledTimes(1);
	});

	it('respects custom debounce time', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(new Map());

		const { result } = renderHook(() =>
			useGitStatus(testRepoPath, true, 500) // 500ms debounce
		);

		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(true);
		});

		// Wait a bit to ensure initial load is complete
		await new Promise(resolve => setTimeout(resolve, 100));

		vi.clearAllMocks();

		result.current.refresh();

		// Wait 250ms - should NOT have called yet (debounce is 500ms)
		await new Promise(resolve => setTimeout(resolve, 250));
		expect(gitUtils.getGitStatusCached).not.toHaveBeenCalled();

		// Wait another 350ms (600ms total) - should have called by now
		await waitFor(() => {
			expect(gitUtils.getGitStatusCached).toHaveBeenCalled();
		}, { timeout: 500 });

		// Should have been called exactly once
		expect(gitUtils.getGitStatusCached).toHaveBeenCalledTimes(1);
	});

	it('clears debounce timer on unmount', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(new Map());

		const { result, unmount } = renderHook(() => useGitStatus(testRepoPath, true));

		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(true);
		});

		vi.clearAllMocks();

		// Call refresh (will be debounced for 100ms)
		result.current.refresh();

		// Immediately unmount before debounce fires
		unmount();

		// Wait longer than debounce time
		await new Promise(resolve => setTimeout(resolve, 200));

		// Timer should be cleared - no call even after time passes
		expect(gitUtils.getGitStatusCached).not.toHaveBeenCalled();
	});

	it('updates when cwd changes', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(new Map());

		const { result, rerender } = renderHook(
			({ cwd }) => useGitStatus(cwd, true),
			{ initialProps: { cwd: testRepoPath } }
		);

		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(true);
		});

		expect(gitUtils.isGitRepository).toHaveBeenCalledWith(testRepoPath);

		// Change cwd
		rerender({ cwd: nonRepoPath });

		await waitFor(() => {
			expect(gitUtils.isGitRepository).toHaveBeenCalledWith(nonRepoPath);
		});
	});

	it('clears state when disabled mid-session', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(
			new Map([['file.txt', 'modified']])
		);

		const { result, rerender } = renderHook(
			({ enabled }) => useGitStatus(testRepoPath, enabled),
			{ initialProps: { enabled: true } }
		);

		await waitFor(() => {
			expect(result.current.gitStatus.size).toBe(1);
		});

		// Disable git status
		rerender({ enabled: false });

		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(false);
			expect(result.current.gitStatus.size).toBe(0);
		});
	});

	it('handles git command errors gracefully', async () => {
		// Mock: isGitRepository succeeds but getGitStatusCached fails
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockRejectedValue(
			new Error('Git command failed')
		);

		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		// Should not crash, should disable git
		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(false);
		});

		expect(result.current.gitStatus.size).toBe(0);
	});

	it('handles isGitRepository errors gracefully', async () => {
		// Mock: isGitRepository fails
		vi.mocked(gitUtils.isGitRepository).mockRejectedValue(
			new Error('Git not installed')
		);

		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		// Should not crash, should disable git
		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(false);
		});

		expect(result.current.gitStatus.size).toBe(0);
	});

	it('handles multiple status types correctly', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(
			new Map([
				['modified.ts', 'modified'],
				['added.ts', 'added'],
				['deleted.ts', 'deleted'],
				['untracked.ts', 'untracked'],
			])
		);

		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		await waitFor(() => {
			expect(result.current.gitStatus.size).toBe(4);
		});

		expect(result.current.gitStatus.get('modified.ts')).toBe('modified');
		expect(result.current.gitStatus.get('added.ts')).toBe('added');
		expect(result.current.gitStatus.get('deleted.ts')).toBe('deleted');
		expect(result.current.gitStatus.get('untracked.ts')).toBe('untracked');
	});

	it('preserves refresh function reference across renders', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(new Map());

		const { result, rerender } = renderHook(() => useGitStatus(testRepoPath, true));

		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(true);
		});

		const firstRefresh = result.current.refresh;

		// Trigger re-render
		rerender();

		// Refresh function should be stable
		expect(result.current.refresh).toBe(firstRefresh);
	});

	it('handles rapid cwd changes correctly', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(new Map());

		const { rerender } = renderHook(
			({ cwd }) => useGitStatus(cwd, true),
			{ initialProps: { cwd: testRepoPath } }
		);

		// Rapidly change cwd multiple times
		rerender({ cwd: nonRepoPath });
		rerender({ cwd: testRepoPath });
		rerender({ cwd: nonRepoPath });

		// Should eventually settle on the last cwd
		await waitFor(() => {
			expect(gitUtils.isGitRepository).toHaveBeenLastCalledWith(nonRepoPath);
		});
	});

	it('cancels pending refresh when cwd changes', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(new Map());

		const { result, rerender } = renderHook(
			({ cwd }) => useGitStatus(cwd, true),
			{ initialProps: { cwd: testRepoPath } }
		);

		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(true);
		});

		vi.clearAllMocks();

		// Schedule a refresh (will be debounced for 100ms)
		result.current.refresh();

		// Change cwd before refresh timer fires
		rerender({ cwd: nonRepoPath });

		// The cwd change triggers immediate useEffect re-run
		// New cwd should trigger new fetch via useEffect
		await waitFor(() => {
			expect(gitUtils.isGitRepository).toHaveBeenCalledWith(nonRepoPath);
		}, { timeout: 500 });
	});

	it('handles empty git status correctly', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(new Map());

		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(true);
		});

		// Clean repository - no changes
		expect(result.current.gitStatus.size).toBe(0);
		expect(result.current.gitStatus).toBeInstanceOf(Map);
	});

	it('exposes clear method', () => {
		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		expect(typeof result.current.clear).toBe('function');
	});

	it('clear() empties git status map immediately', async () => {
		// Set up repo with modified files
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(
			new Map([
				['file1.txt', 'modified'],
				['file2.txt', 'added'],
			])
		);

		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		// Wait for initial load
		await waitFor(() => {
			expect(result.current.gitStatus.size).toBe(2);
		});

		expect(result.current.gitEnabled).toBe(true);

		// Call clear
		act(() => {
			result.current.clear();
		});

		// Should immediately clear status
		expect(result.current.gitStatus.size).toBe(0);
		expect(result.current.gitEnabled).toBe(false);
	});

	it('clear() cancels pending refresh', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(new Map());

		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(true);
		});

		vi.clearAllMocks();

		// Schedule a refresh (will be debounced for 100ms)
		act(() => {
			result.current.refresh();
		});

		// Immediately clear before refresh timer fires
		act(() => {
			result.current.clear();
		});

		// Wait longer than debounce time
		await new Promise(resolve => setTimeout(resolve, 200));

		// Refresh should have been canceled - no call to getGitStatusCached
		expect(gitUtils.getGitStatusCached).not.toHaveBeenCalled();
	});

	it('clear() invalidates in-flight requests', async () => {
		// Mock slow git status fetch
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockImplementation(async () => {
			await new Promise(resolve => setTimeout(resolve, 100));
			return new Map([['file.txt', 'modified']]);
		});

		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		// Wait for initial load to start
		await new Promise(resolve => setTimeout(resolve, 10));

		// Clear while fetch is in-flight
		act(() => {
			result.current.clear();
		});

		// Wait for the fetch to complete
		await new Promise(resolve => setTimeout(resolve, 150));

		// Status should remain empty (in-flight request was invalidated)
		expect(result.current.gitStatus.size).toBe(0);
		expect(result.current.gitEnabled).toBe(false);
	});

	it('clears status immediately when cwd changes', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(
			new Map([['file1.txt', 'modified']])
		);

		const { result, rerender } = renderHook(
			({ cwd }) => useGitStatus(cwd, true),
			{ initialProps: { cwd: testRepoPath } }
		);

		// Wait for initial load
		await waitFor(() => {
			expect(result.current.gitStatus.size).toBe(1);
		});

		// Mock new status for new cwd
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(
			new Map([['file2.txt', 'added']])
		);

		// Change cwd
		rerender({ cwd: nonRepoPath });

		// Status should be immediately cleared (synchronously)
		expect(result.current.gitStatus.size).toBe(0);
		expect(result.current.gitEnabled).toBe(false);

		// Wait for new status to load
		await waitFor(() => {
			expect(result.current.gitStatus.size).toBe(1);
		});

		expect(result.current.gitStatus.get('file2.txt')).toBe('added');
	});

	it('preserves clear function reference across renders', async () => {
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(new Map());

		const { result, rerender } = renderHook(() => useGitStatus(testRepoPath, true));

		await waitFor(() => {
			expect(result.current.gitEnabled).toBe(true);
		});

		const firstClear = result.current.clear;

		// Trigger re-render
		rerender();

		// Clear function should be stable
		expect(result.current.clear).toBe(firstClear);
	});

	it('allows refresh after clear when enabled remains true', async () => {
		// Initial state: one modified file
		vi.mocked(gitUtils.isGitRepository).mockResolvedValue(true);
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(
			new Map([['file1.txt', 'modified']])
		);

		const { result } = renderHook(() => useGitStatus(testRepoPath, true));

		// Wait for initial load
		await waitFor(() => {
			expect(result.current.gitStatus.size).toBe(1);
		});

		// Call clear
		act(() => {
			result.current.clear();
		});

		// Status should be empty
		expect(result.current.gitStatus.size).toBe(0);
		expect(result.current.gitEnabled).toBe(false);

		// Mock new status for refresh
		vi.mocked(gitUtils.getGitStatusCached).mockResolvedValue(
			new Map([
				['file1.txt', 'modified'],
				['file2.txt', 'added'],
			])
		);

		// Call refresh to repopulate
		act(() => {
			result.current.refresh();
		});

		// Wait for refresh to complete
		await waitFor(() => {
			expect(result.current.gitStatus.size).toBe(2);
		}, { timeout: 500 });

		// Status should be repopulated
		expect(result.current.gitStatus.get('file1.txt')).toBe('modified');
		expect(result.current.gitStatus.get('file2.txt')).toBe('added');
		expect(result.current.gitEnabled).toBe(true);
	});
});
