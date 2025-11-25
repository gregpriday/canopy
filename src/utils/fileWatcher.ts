import chokidar, { FSWatcher, ChokidarOptions } from 'chokidar';
import path from 'path';
import { WatcherError } from './errorTypes.js';
import { logWarn, logError, logInfo } from './logger.js';
import { debounce } from './debounce.js';
import { perfMonitor } from './perfMetrics.js';

export type FileChangeType = 'add' | 'change' | 'unlink' | 'unlinkDir' | 'addDir';

export interface FileChangeEvent {
	type: FileChangeType;
	path: string;
	timestamp: number;
}

export interface FileWatcherOptions {
	ignored?: ChokidarOptions['ignored']; // Patterns to ignore (supports string, RegExp, function, etc.)
	debounce?: number; // Debounce time in ms (default 100)
	batchWindow?: number; // Time window to collect events for batching (default 50ms)
	usePolling?: boolean; // Use polling instead of native file watching (default true)
	onBatch?: (events: FileChangeEvent[]) => void; // Batched event handler
	// Legacy individual handlers (deprecated in favor of onBatch)
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
 * Deduplicate file change events.
 * Keeps only the most recent event for each path+type combination.
 */
function deduplicateEvents(events: FileChangeEvent[]): FileChangeEvent[] {
	const seen = new Map<string, FileChangeEvent>();

	for (const event of events) {
		const key = `${event.path}:${event.type}`;
		// Keep only the most recent event for each path+type
		seen.set(key, event);
	}

	return Array.from(seen.values());
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
		batchWindow = 50,
		usePolling = true,
		onBatch,
		onAdd,
		onChange,
		onUnlink,
		onUnlinkDir,
		onAddDir,
		onError,
	} = options;

	let watcher: FSWatcher | null = null;
	let isActive = false;

	// Batching state
	const pendingEvents: FileChangeEvent[] = [];
	let batchTimer: NodeJS.Timeout | null = null;

	/**
	 * Process accumulated batch of events.
	 * Deduplicates events and invokes the batch handler with debouncing.
	 */
	const processBatch = () => {
		if (pendingEvents.length === 0) {
			return;
		}

		// Record batch size metric
		perfMonitor.recordMetric('watcher-batch-size', pendingEvents.length);

		// Deduplicate events
		const uniqueEvents = deduplicateEvents(pendingEvents);
		perfMonitor.recordMetric(
			'watcher-unique-events',
			uniqueEvents.length,
		);

		// Clear pending events
		pendingEvents.length = 0;
		batchTimer = null;

		// Invoke batch handler
		if (onBatch) {
			onBatch(uniqueEvents);
		}

		// Also invoke legacy individual handlers for backward compatibility
		for (const event of uniqueEvents) {
			switch (event.type) {
				case 'add':
					onAdd?.(event.path);
					break;
				case 'change':
					onChange?.(event.path);
					break;
				case 'unlink':
					onUnlink?.(event.path);
					break;
				case 'unlinkDir':
					onUnlinkDir?.(event.path);
					break;
				case 'addDir':
					onAddDir?.(event.path);
					break;
			}
		}
	};

	// Debounced batch processor
	const debouncedProcessBatch = debounce(processBatch, debounceMs, {
		leading: false,
		trailing: true,
		maxWait: 1000, // Force processing after 1 second even during continuous changes
	});

	/**
	 * Add an event to the batch queue.
	 * Events are collected for batchWindow ms before being processed.
	 */
	const queueEvent = (type: FileChangeType, relativePath: string) => {
		pendingEvents.push({
			type,
			path: relativePath,
			timestamp: Date.now(),
		});

		// Clear existing batch timer
		if (batchTimer) {
			clearTimeout(batchTimer);
		}

		// Set new batch timer
		batchTimer = setTimeout(() => {
			debouncedProcessBatch();
		}, batchWindow);
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
				// STRATEGY: Two-layer filtering for performance and correctness
				// 1. File watcher blocks node_modules, dist, .git, etc. (prevents CPU spike)
				// 2. Git status is the source of truth (catches any leaks)
				ignored: Array.isArray(ignored)
					? [
							// Always include .git blocking (glob patterns don't reliably match root .git/)
							(filePath: string) => {
								const relativePath = path.relative(rootPath, filePath);
								const normalizedPath = relativePath.split(path.sep).join('/');
								return normalizedPath === '.git' || normalizedPath.startsWith('.git/');
							},
							// Include user-provided patterns
							...ignored
					  ]
					: ignored,

				// Use polling mode for reliable file watching (configurable)
				usePolling,
				interval: 100,
				binaryInterval: 300,

				// Don't follow symlinks (can cause infinite loops)
				followSymlinks: false,

				// Depth of subdirectories to watch (null = unlimited)
				depth: undefined,
			};

			// Create the watcher
			watcher = chokidar.watch(rootPath, chokidarOptions);

			// Register event handlers with batching
			watcher.on('add', (filePath: string) => {
				const relativePath = normalizePath(path.relative(rootPath, filePath));
				queueEvent('add', relativePath);
			});

			watcher.on('change', (filePath: string) => {
				const relativePath = normalizePath(path.relative(rootPath, filePath));
				queueEvent('change', relativePath);
			});

			watcher.on('unlink', (filePath: string) => {
				const relativePath = normalizePath(path.relative(rootPath, filePath));
				queueEvent('unlink', relativePath);
			});

			watcher.on('unlinkDir', (dirPath: string) => {
				const relativePath = normalizePath(path.relative(rootPath, dirPath));
				queueEvent('unlinkDir', relativePath);
			});

			watcher.on('addDir', (dirPath: string) => {
				const relativePath = normalizePath(path.relative(rootPath, dirPath));
				queueEvent('addDir', relativePath);
			});

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

		// Cancel any pending batch timer
		if (batchTimer) {
			clearTimeout(batchTimer);
			batchTimer = null;
		}

		// Cancel debounced batch processor
		debouncedProcessBatch.cancel();

		// Clear pending events
		pendingEvents.length = 0;

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
 * @param customIgnores - User-defined ignore patterns (may include gitignore negations)
 * @returns Array of patterns for chokidar (with negations filtered out)
 */
export function buildIgnorePatterns(customIgnores: string[] = []): string[] {
	// Base ignored patterns for Chokidar
	// Note: These are for performance - they reduce watcher load for the file tree view.
	// The WorktreeMonitor uses git status as the source of truth for changes,
	// so even if patterns leak, traffic lights won't activate for ignored files.
	const standardIgnores = [
		'**/node_modules/**',
		'**/.git/**',
		'**/.DS_Store',
		'**/dist/**',
		'**/build/**',
		'**/coverage/**',
		'**/.next/**',
		'**/__pycache__/**',
	];

	// Filter out gitignore negations (patterns starting with '!')
	// Chokidar treats '!foo' as "match everything except foo", which would suppress nearly all events
	// Negations are used in .gitignore to un-ignore files, but we only want positive ignore patterns here
	const positiveIgnores = customIgnores.filter(pattern => !pattern.startsWith('!'));

	return [...standardIgnores, ...positiveIgnores];
}
