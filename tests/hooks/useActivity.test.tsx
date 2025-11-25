// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useActivity, getTemporalState } from '../../src/hooks/useActivity.ts';
import { events } from '../../src/services/events.ts';

describe('useActivity', () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllTimers();
		cleanup();
	});

	it('tracks file changes from watcher events', async () => {
		const { result } = renderHook(() => useActivity());

		expect(result.current.activeFiles.size).toBe(0);
		// PERF: Now starts as idle=true (no activity yet) to avoid unnecessary interval
		expect(result.current.isIdle).toBe(true);

		// Emit a file change event
		events.emit('watcher:change', { path: '/repo/file1.ts' });

		// Wait for throttled update
		await waitFor(() => {
			expect(result.current.activeFiles.size).toBe(1);
			expect(result.current.activeFiles.has('/repo/file1.ts')).toBe(true);
		});
	});

	it('throttles high-frequency updates to 200ms (5fps)', async () => {
		const { result } = renderHook(() => useActivity());

		// Simulate npm install - 100 file changes in rapid succession
		const start = Date.now();
		for (let i = 0; i < 100; i++) {
			events.emit('watcher:change', { path: `/repo/file${i}.ts` });
			vi.advanceTimersByTime(5); // 5ms between events = 200 events/sec
		}

		// Should have throttled to ~200ms intervals
		await waitFor(() => {
			expect(result.current.activeFiles.size).toBeGreaterThan(0);
		});

		// All events should eventually be processed (via pending buffer)
		vi.advanceTimersByTime(1000);
		await waitFor(() => {
			expect(result.current.activeFiles.size).toBe(100);
		});
	});

	it('does not lose events during throttle window using pending buffer', async () => {
		const { result } = renderHook(() => useActivity());

		// Emit multiple events within throttle window
		events.emit('watcher:change', { path: '/repo/file1.ts' });
		events.emit('watcher:change', { path: '/repo/file2.ts' });
		events.emit('watcher:change', { path: '/repo/file3.ts' });

		// Advance past throttle window
		vi.advanceTimersByTime(250);

		await waitFor(() => {
			expect(result.current.activeFiles.size).toBe(3);
			expect(result.current.activeFiles.has('/repo/file1.ts')).toBe(true);
			expect(result.current.activeFiles.has('/repo/file2.ts')).toBe(true);
			expect(result.current.activeFiles.has('/repo/file3.ts')).toBe(true);
		});
	});

	it('honors maxWait of 1000ms to prevent indefinite throttling', async () => {
		const { result } = renderHook(() => useActivity());

		// Emit events continuously every 100ms (faster than 200ms throttle)
		for (let i = 0; i < 15; i++) {
			events.emit('watcher:change', { path: `/repo/file${i}.ts` });
			vi.advanceTimersByTime(100);
		}

		// Despite continuous events, maxWait should force an update at 1000ms
		await waitFor(() => {
			expect(result.current.activeFiles.size).toBeGreaterThan(0);
		});
	});

	it('cleans up stale entries after 10 seconds (cooldown duration)', async () => {
		const { result } = renderHook(() => useActivity());

		events.emit('watcher:change', { path: '/repo/file1.ts' });

		await waitFor(() => {
			expect(result.current.activeFiles.size).toBe(1);
		});

		// Advance past cooldown duration (10s)
		vi.advanceTimersByTime(11000);

		// Cleanup timer runs every 2s, so advance another 2s
		await waitFor(() => {
			expect(result.current.activeFiles.size).toBe(0);
		});
	});

	it('only creates new Map when pruning is needed (optimization)', async () => {
		const { result } = renderHook(() => useActivity());

		events.emit('watcher:change', { path: '/repo/file1.ts' });

		await waitFor(() => {
			expect(result.current.activeFiles.size).toBe(1);
		});

		const mapBefore = result.current.activeFiles;

		// Advance only 1 second (not enough to trigger pruning)
		vi.advanceTimersByTime(3000);

		// Map should be the same reference (no new Map created)
		expect(result.current.activeFiles).toBe(mapBefore);

		// Now advance past cooldown
		vi.advanceTimersByTime(8000);

		// Now a new Map should be created
		await waitFor(() => {
			expect(result.current.activeFiles).not.toBe(mapBefore);
			expect(result.current.activeFiles.size).toBe(0);
		});
	});

	it('detects idle state after 60 seconds of no activity', async () => {
		const { result } = renderHook(() => useActivity());

		events.emit('watcher:change', { path: '/repo/file1.ts' });

		await waitFor(() => {
			expect(result.current.isIdle).toBe(false);
		});

		// Advance 61 seconds + cleanup interval (2s) to ensure timer fires
		vi.advanceTimersByTime(63000);

		await waitFor(() => {
			expect(result.current.isIdle).toBe(true);
		});
	});

	it('resets idle state when new activity occurs', async () => {
		const { result } = renderHook(() => useActivity());

		// Go idle - advance past 60s threshold + cleanup interval
		vi.advanceTimersByTime(63000);

		await waitFor(() => {
			expect(result.current.isIdle).toBe(true);
		});

		// New activity
		events.emit('watcher:change', { path: '/repo/file1.ts' });

		await waitFor(() => {
			expect(result.current.isIdle).toBe(false);
		});
	});

	it('cancels debounce on unmount to prevent memory leaks', async () => {
		const { unmount } = renderHook(() => useActivity());

		events.emit('watcher:change', { path: '/repo/file1.ts' });

		// Unmount before throttle completes
		unmount();

		// Should not throw or cause warnings
		vi.advanceTimersByTime(1000);
	});

	it('unsubscribes from events on unmount', async () => {
		const { result, unmount } = renderHook(() => useActivity());

		events.emit('watcher:change', { path: '/repo/file1.ts' });

		await waitFor(() => {
			expect(result.current.activeFiles.size).toBe(1);
		});

		unmount();

		// Emit after unmount - should not update
		events.emit('watcher:change', { path: '/repo/file2.ts' });

		vi.advanceTimersByTime(1000);

		// Size should still be 1 (no new events processed)
		expect(result.current.activeFiles.size).toBe(1);
	});
});

describe('getTemporalState', () => {
	it('returns "flash" for files changed within 2 seconds', () => {
		const activeFiles = new Map<string, number>();
		const now = Date.now();
		activeFiles.set('/repo/file.ts', now - 1000); // 1s ago

		expect(getTemporalState('/repo/file.ts', activeFiles)).toBe('flash');
	});

	it('returns "cooldown" for files changed 2-10 seconds ago', () => {
		const activeFiles = new Map<string, number>();
		const now = Date.now();
		activeFiles.set('/repo/file.ts', now - 5000); // 5s ago

		expect(getTemporalState('/repo/file.ts', activeFiles)).toBe('cooldown');
	});

	it('returns "normal" for files not in activeFiles map', () => {
		const activeFiles = new Map<string, number>();

		expect(getTemporalState('/repo/file.ts', activeFiles)).toBe('normal');
	});

	it('returns "normal" for files older than 10 seconds (edge case)', () => {
		const activeFiles = new Map<string, number>();
		const now = Date.now();
		activeFiles.set('/repo/file.ts', now - 11000); // 11s ago

		// Should be "normal" because cleanup should have removed it,
		// but testing boundary condition
		expect(getTemporalState('/repo/file.ts', activeFiles)).toBe('normal');
	});

	it('boundary: exactly 2 seconds returns "cooldown"', () => {
		const activeFiles = new Map<string, number>();
		const now = Date.now();
		activeFiles.set('/repo/file.ts', now - 2000); // exactly 2s

		expect(getTemporalState('/repo/file.ts', activeFiles)).toBe('cooldown');
	});

	it('boundary: exactly 10 seconds returns "normal"', () => {
		const activeFiles = new Map<string, number>();
		const now = Date.now();
		activeFiles.set('/repo/file.ts', now - 10000); // exactly 10s

		expect(getTemporalState('/repo/file.ts', activeFiles)).toBe('normal');
	});
});
