import { useState, useEffect, useCallback, useRef } from 'react';
import {
	getGitStatusCached,
	isGitRepository,
	invalidateGitStatusCache,
} from '../utils/git.js';
import { logWarn } from '../utils/logger.js';
import type { GitStatus } from '../types/index.js';
import { debounce } from '../utils/debounce.js';
import { events } from '../services/events.js';

/**
 * Hook return value interface
 */
export interface UseGitStatusReturn {
	/** Map of file paths to git status */
	gitStatus: Map<string, GitStatus>;
	/** Whether the directory is a git repository */
	gitEnabled: boolean;
	/** Manually refresh git status (debounced) */
	refresh: (forceRefresh?: boolean) => void;
	/** Clear git status immediately (for worktree switches) */
	clear: () => void;
	/** Whether the initial status fetch is in progress */
	isLoading: boolean;
}

/**
 * React hook to manage git status state with automatic refresh and debouncing.
 *
 * Features:
 * - Loads initial git status on mount
 * - Provides debounced refresh function
 * - Detects if directory is a git repository
 * - Gracefully handles non-git directories
 * - Respects enabled flag (typically from config.showGitStatus)
 *
 * @param cwd - Current working directory to check git status for
 * @param enabled - Whether git status tracking is enabled (from config)
 * @param debounceMs - Debounce delay for refresh calls (default: 100ms)
 * @returns Git status state and refresh function
 *
 * @example
 * ```typescript
 * const { gitStatus, gitEnabled, refresh } = useGitStatus(
 *   '/path/to/repo',
 *   config.showGitStatus
 * );
 *
 * // Use gitStatus to display markers in tree
 * const status = gitStatus.get('src/App.tsx'); // 'modified' | undefined
 *
 * // Refresh on file changes
 * watcher.on('change', () => refresh());
 * ```
 */
export function useGitStatus(
	cwd: string,
	enabled: boolean,
	debounceMs: number = 100,
): UseGitStatusReturn {
	// State
	const [gitStatus, setGitStatus] = useState<Map<string, GitStatus>>(new Map());
	const [gitEnabled, setGitEnabled] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	// Ref to track if component is mounted (prevent setState after unmount)
	const isMountedRef = useRef<boolean>(true);

	// Ref to track latest request (ignore stale responses)
	const requestIdRef = useRef<number>(0);

	// Ref to track ongoing fetch promise to prevent concurrent fetches
	const ongoingFetchRef = useRef<Promise<void> | null>(null);
	// Ref to track pending forced refresh while a fetch is in-flight
	const pendingForceRefreshRef = useRef<boolean>(false);

	/**
	 * Internal function to actually fetch and update git status.
	 * Uses cached results when available.
	 */
	const fetchGitStatus = useCallback(
		async (forceRefresh = false) => {
			if (!enabled) {
				// Git status disabled in config - clear state and invalidate in-flight requests
				++requestIdRef.current; // Invalidate any pending requests
				if (isMountedRef.current) {
					setGitStatus(new Map());
					setGitEnabled(false);
					setIsLoading(false);
				}
				return;
			}

			// If there's an ongoing fetch, wait for it instead of starting a new one.
			// Queue a forced refresh if requested so we rerun after the current fetch.
			if (ongoingFetchRef.current) {
				if (forceRefresh) {
					pendingForceRefreshRef.current = true;
				}
				await ongoingFetchRef.current;

				if (pendingForceRefreshRef.current) {
					pendingForceRefreshRef.current = false;
					// Force a follow-up refresh since we now know data changed
					return fetchGitStatus(true);
				}

				return;
			}

			// Increment request ID to track this fetch
			const currentRequestId = ++requestIdRef.current;

			// Invalidate cache if force refresh requested
			if (forceRefresh) {
				invalidateGitStatusCache(cwd);
			}

			const fetchPromise = (async () => {
				try {
					// Check if directory is a git repository
					const isRepo = await isGitRepository(cwd);

					// Only update state if this is still the latest request and component is mounted
					if (
						currentRequestId !== requestIdRef.current ||
						!isMountedRef.current
					) {
						return;
					}

					setGitEnabled(isRepo);

					if (!isRepo) {
						// Not a git repo - clear status
						setGitStatus(new Map());
						return;
					}

					// Fetch git status with caching
					const status = await getGitStatusCached(cwd, forceRefresh);

					// Check again before updating state (async operation completed)
					if (
						currentRequestId !== requestIdRef.current ||
						!isMountedRef.current
					) {
						return;
					}

					setGitStatus(status);
				} catch (error) {
					// Only update state if this is still the latest request and component is mounted
					if (
						currentRequestId !== requestIdRef.current ||
						!isMountedRef.current
					) {
						return;
					}

					// Git command failed - log warning and disable
					logWarn('Failed to fetch git status:', { message: (error as Error).message });
					setGitEnabled(false);
					setGitStatus(new Map());
				} finally {
					ongoingFetchRef.current = null;
					if (isMountedRef.current) {
						setIsLoading(false);
					}
				}
			})();

			ongoingFetchRef.current = fetchPromise;
			await fetchPromise;
		},
		[cwd, enabled],
	);

	// Create debounced refresh function using the new utility
	const debouncedFetch = useRef(
		debounce(
			(forceRefresh: boolean = false) => {
				fetchGitStatus(forceRefresh);
			},
			debounceMs,
			{ leading: false, trailing: true, maxWait: 2000 },
		),
	);

	// Update debounce delay if it changes
	useEffect(() => {
		debouncedFetch.current = debounce(
			(forceRefresh: boolean = false) => {
				fetchGitStatus(forceRefresh);
			},
			debounceMs,
			{ leading: false, trailing: true, maxWait: 2000 },
		);
	}, [debounceMs, fetchGitStatus]);

	/**
	 * Debounced refresh function exposed to callers.
	 * Multiple rapid calls will be coalesced into a single fetch.
	 */
	const refresh = useCallback(
		(forceRefresh = true) => {
			debouncedFetch.current(forceRefresh);
		},
		[],
	);

	useEffect(() => {
		return events.on('sys:refresh', () => {
			refresh(true);
		});
	}, [refresh]);

	/**
	 * Clear git status immediately (synchronous).
	 * Used during worktree switches to prevent stale markers.
	 * Invalidates any in-flight requests.
	 */
	const clear = useCallback(() => {
		// Invalidate any pending requests
		++requestIdRef.current;

		// Cancel any pending debounced calls
		debouncedFetch.current.cancel();
		pendingForceRefreshRef.current = false;

		// Invalidate cache for this directory
		invalidateGitStatusCache(cwd);

		// Immediately clear state
		setGitStatus(new Map());
		setGitEnabled(false);
	}, [cwd]);

	/**
	 * Load initial git status on mount and when cwd/enabled changes.
	 * Clear state immediately before fetching to prevent stale data.
	 */
	useEffect(() => {
		// Mark component as mounted
		isMountedRef.current = true;

		// Clear state immediately when cwd changes
		clear();

		// Immediate fetch (no debounce for initial load)
		fetchGitStatus(true); // Force refresh on mount

		// Cleanup: cancel pending debounce and mark as unmounted
		return () => {
			isMountedRef.current = false;
			debouncedFetch.current.cancel();
		};
	}, [fetchGitStatus, clear]);

	return {
		gitStatus,
		gitEnabled,
		refresh,
		clear,
		isLoading,
	};
}
