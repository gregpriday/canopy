import chokidar, { FSWatcher, ChokidarOptions } from 'chokidar';
import path from 'path';
import { WatcherError } from './errorTypes.js';
import { logWarn, logError, logInfo } from './logger.js';

export interface FileWatcherOptions {
	ignored?: ChokidarOptions['ignored']; // Patterns to ignore (supports string, RegExp, function, etc.)
	debounce?: number; // Debounce time in ms (default 100)
	onAdd?: (path: string) => void;
	onChange?: (path: string) => void;
	onUnlink?: (path: string) => void;
	onUnlinkDir?: (path: string) => void;
	onAddDir?: (path: string) => void;
	onError?: (error: Error) => void;
}

export interface FileWatcher {
	start(): void;
	stop(): Promise<void>;
	isWatching(): boolean;
}

/**
 * Create a debounced function that delays execution until after a specified time.
 * Subsequent calls reset the delay timer.
 *
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function with cleanup
 */
function debounce<T extends (...args: any[]) => void>(
	fn: T,
	delay: number,
): T & { cancel: () => void } {
	let timeoutId: NodeJS.Timeout | null = null;

	const debounced = ((...args: any[]) => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			timeoutId = null;
			fn(...args);
		}, delay);
	}) as T & { cancel: () => void };

	debounced.cancel = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	return debounced;
}

/**
 * Normalize file path to use forward slashes (POSIX-style).
 * This ensures consistent path separators across platforms (Windows uses backslashes).
 *
 * @param filePath - Path to normalize
 * @returns Path with forward slashes
 */
function normalizePath(filePath: string): string {
	return filePath.split(path.sep).join('/');
}

/**
 * Create a file system watcher for a directory.
 * Watches for file additions, changes, and deletions with configurable debouncing.
 *
 * @param rootPath - Directory to watch
 * @param options - Watcher configuration and event handlers
 * @returns FileWatcher instance with start/stop methods
 */
export function createFileWatcher(
	rootPath: string,
	options: FileWatcherOptions = {},
): FileWatcher {
	const {
		ignored = [],
		debounce: debounceMs = 100,
		onAdd,
		onChange,
		onUnlink,
		onUnlinkDir,
		onAddDir,
		onError,
	} = options;

	let watcher: FSWatcher | null = null;
	let isActive = false;

	// Create debounced versions of event handlers
	const debouncedHandlers = {
		add: onAdd ? debounce(onAdd, debounceMs) : null,
		change: onChange ? debounce(onChange, debounceMs) : null,
		unlink: onUnlink ? debounce(onUnlink, debounceMs) : null,
		unlinkDir: onUnlinkDir ? debounce(onUnlinkDir, debounceMs) : null,
		addDir: onAddDir ? debounce(onAddDir, debounceMs) : null,
	};

	const start = (): void => {
		if (isActive) {
			logWarn('File watcher is already running', { rootPath });
			return;
		}

		try {
			// Configure chokidar options
			const chokidarOptions: ChokidarOptions = {
				// Don't emit events for files that exist when watcher starts
				ignoreInitial: true,

				// Wait for file writes to finish before emitting events
				// This prevents multiple events for a single file operation
				awaitWriteFinish: {
					stabilityThreshold: debounceMs,
					pollInterval: 100,
				},

				// Patterns to ignore
				ignored,

				// Use efficient native watching when available
				usePolling: false,

				// Don't follow symlinks (can cause infinite loops)
				followSymlinks: false,

				// Depth of subdirectories to watch (null = unlimited)
				depth: undefined,
			};

			// Create the watcher
			watcher = chokidar.watch(rootPath, chokidarOptions);

			// Register event handlers
			if (debouncedHandlers.add) {
				watcher.on('add', (filePath: string) => {
					const relativePath = normalizePath(path.relative(rootPath, filePath));
					debouncedHandlers.add!(relativePath);
				});
			}

			if (debouncedHandlers.change) {
				watcher.on('change', (filePath: string) => {
					const relativePath = normalizePath(path.relative(rootPath, filePath));
					debouncedHandlers.change!(relativePath);
				});
			}

			if (debouncedHandlers.unlink) {
				watcher.on('unlink', (filePath: string) => {
					const relativePath = normalizePath(path.relative(rootPath, filePath));
					debouncedHandlers.unlink!(relativePath);
				});
			}

			if (debouncedHandlers.unlinkDir) {
				watcher.on('unlinkDir', (dirPath: string) => {
					const relativePath = normalizePath(path.relative(rootPath, dirPath));
					debouncedHandlers.unlinkDir!(relativePath);
				});
			}

			if (debouncedHandlers.addDir) {
				watcher.on('addDir', (dirPath: string) => {
					const relativePath = normalizePath(path.relative(rootPath, dirPath));
					debouncedHandlers.addDir!(relativePath);
				});
			}

			// Error handler
			watcher.on('error', (error: unknown) => {
				const err = error instanceof Error ? error : new Error(String(error));
				const watcherError = new WatcherError('File watcher error', { rootPath }, err);
				logError('File watcher error', watcherError);

				// Stop watcher on fatal errors (ENOSPC, EPERM, etc.)
				// This allows the caller to detect the failure and handle recovery
				if (isActive) {
					isActive = false;
					// Close and clear the watcher to prevent resource leaks
					// and allow clean restart if needed
					if (watcher) {
						watcher.close().catch((closeError) => {
							logError('Error closing watcher after error', closeError);
						});
						watcher = null;
					}
				}

				if (onError) {
					onError(watcherError);
				}
			});

			// Ready handler (watcher is initialized)
			watcher.on('ready', () => {
				logInfo('File watcher started', { rootPath });
			});

			isActive = true;
		} catch (error) {
			const watcherError = new WatcherError(
		// Normalize error cause to always be an Error instance
				'Failed to start file watcher',
				{ rootPath },
				error instanceof Error ? error : new Error(String(error))
			);
			logError('Failed to start file watcher', watcherError);
			if (onError) {
				onError(watcherError);
			}
			throw watcherError;
		}
	};

	const stop = async (): Promise<void> => {
		if (!isActive || !watcher) {
			return;
		}

		// Cancel any pending debounced calls
		Object.values(debouncedHandlers).forEach((handler) => {
			if (handler) {
				handler.cancel();
			}
		});

		// Close the watcher
		try {
			await watcher.close();
			logInfo('File watcher stopped', { rootPath });
			watcher = null;
			isActive = false;
		} catch (error) {
		// Normalize error cause to always be an Error instance
			const watcherError = new WatcherError(
				'Error stopping file watcher',
				{ rootPath },
				error instanceof Error ? error : undefined
			);
			logError('Error stopping file watcher', watcherError);
			// Still mark as stopped even if close fails
			watcher = null;
			isActive = false;
			// Rethrow so caller knows about the failure
			throw watcherError;
		}
	};

	const isWatching = (): boolean => {
		return isActive;
	};

	return {
		start,
		stop,
		isWatching,
	};
}

/**
 * Build ignore patterns from config.
 * Combines customIgnores with standard patterns like node_modules, .git, etc.
 *
 * @param customIgnores - User-defined ignore patterns
 * @returns Array of patterns for chokidar
 */
export function buildIgnorePatterns(customIgnores: string[] = []): string[] {
	// Standard patterns to always ignore
	const standardIgnores = [
		'**/node_modules/**',
		'**/.git/**',
		'**/.DS_Store',
		'**/Thumbs.db',
		'**/*.swp',
		'**/*.swo',
		'**/.vscode/**',
		'**/.idea/**',
	];

	return [...standardIgnores, ...customIgnores];
}
