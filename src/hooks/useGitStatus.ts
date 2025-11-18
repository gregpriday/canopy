import { useState, useEffect, useCallback, useRef } from 'react';
import { getGitStatus, isGitRepository } from '../utils/git.js';
import type { GitStatus } from '../types/index.js';

/**
 * Hook return value interface
 */
export interface UseGitStatusReturn {
	/** Map of file paths to git status */
	gitStatus: Map<string, GitStatus>;
	/** Whether the directory is a git repository */
	gitEnabled: boolean;
	/** Manually refresh git status (debounced) */
	refresh: () => void;
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

	// Ref to track pending debounce timer
	const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

	// Ref to track if component is mounted (prevent setState after unmount)
	const isMountedRef = useRef<boolean>(true);

	// Ref to track latest request (ignore stale responses)
	const requestIdRef = useRef<number>(0);

	/**
	 * Internal function to actually fetch and update git status.
	 * Not debounced - called by the debounced refresh function.
	 */
	const fetchGitStatus = useCallback(async () => {
		if (!enabled) {
			// Git status disabled in config - clear state and invalidate in-flight requests
			++requestIdRef.current; // Invalidate any pending requests
			if (isMountedRef.current) {
				setGitStatus(new Map());
				setGitEnabled(false);
			}
			return;
		}

		// Increment request ID to track this fetch
		const currentRequestId = ++requestIdRef.current;

		try {
			// Check if directory is a git repository
			const isRepo = await isGitRepository(cwd);

			// Only update state if this is still the latest request and component is mounted
			if (currentRequestId !== requestIdRef.current || !isMountedRef.current) {
				return;
			}

			setGitEnabled(isRepo);

			if (!isRepo) {
				// Not a git repo - clear status
				setGitStatus(new Map());
				return;
			}

			// Fetch git status
			const status = await getGitStatus(cwd);

			// Check again before updating state (async operation completed)
			if (currentRequestId !== requestIdRef.current || !isMountedRef.current) {
				return;
			}

			setGitStatus(status);

		} catch (error) {
			// Only update state if this is still the latest request and component is mounted
			if (currentRequestId !== requestIdRef.current || !isMountedRef.current) {
				return;
			}

			// Git command failed - log warning and disable
			console.warn('Failed to fetch git status:', (error as Error).message);
			setGitEnabled(false);
			setGitStatus(new Map());
		}
	}, [cwd, enabled]);

	/**
	 * Debounced refresh function exposed to callers.
	 * Multiple rapid calls will be coalesced into a single fetch.
	 */
	const refresh = useCallback(() => {
		// Clear any pending timer
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}

		// Set new timer
		debounceTimerRef.current = setTimeout(() => {
			fetchGitStatus();
			debounceTimerRef.current = null;
		}, debounceMs);
	}, [fetchGitStatus, debounceMs]);

	/**
	 * Load initial git status on mount and when cwd/enabled changes.
	 * This is NOT debounced - we want immediate feedback on directory change.
	 */
	useEffect(() => {
		// Mark component as mounted
		isMountedRef.current = true;

		// Immediate fetch (no debounce for initial load)
		fetchGitStatus();

		// Cleanup: clear any pending debounce timer and mark as unmounted
		return () => {
			isMountedRef.current = false;

			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
			}
		};
	}, [fetchGitStatus]);

	return {
		gitStatus,
		gitEnabled,
		refresh,
	};
}
