/**
 * Error boundary and retry utilities for robust error handling.
 * Provides graceful degradation and automatic recovery strategies.
 */

import type { Notification, NotificationType } from '../types/index.js';
import { logError, logWarn, logDebug } from './logger.js';
import {
  GitError,
  FileSystemError,
  ConfigError,
  ProcessError,
  WatcherError,
  isTransientError,
  isPermissionError,
  isNotFoundError,
  getUserMessage,
  getErrorDetails,
} from './errorTypes.js';

/**
 * Configuration for error boundaries
 */
interface ErrorBoundaryOptions<T> {
  fallback: T;                          // Value to return on error
  notify?: boolean;                     // Show notification to user
  notificationType?: NotificationType;  // Override notification type
  onError?: (error: unknown) => void;   // Custom error handler
  context?: Record<string, unknown>;    // Additional context for logging
}

/**
 * Configuration for retry logic
 */
interface RetryOptions {
  maxRetries?: number;           // Maximum number of retries (default: 3)
  backoff?: 'none' | 'linear' | 'exponential';  // Backoff strategy (default: exponential)
  baseDelay?: number;            // Base delay in ms (default: 100)
  maxDelay?: number;             // Maximum delay in ms (default: 5000)
  shouldRetry?: (error: unknown, attempt: number) => boolean;  // Custom retry predicate
  notify?: boolean;              // Show notification on final failure
  onRetry?: (error: unknown, attempt: number, delay: number) => void;  // Retry callback
}

/**
 * Wrap a git operation in an error boundary.
 * Catches git errors and provides fallback value.
 */
export async function withGitErrorBoundary<T>(
  operation: () => Promise<T>,
  options: ErrorBoundaryOptions<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const gitError = error instanceof GitError ? error : new GitError(
      'Git operation failed',
      options.context,
      error instanceof Error ? error : undefined
    );

    logError('Git error', gitError, options.context);

    if (options.notify && options.onError) {
      try {
        options.onError(gitError);
      } catch (hookError) {
        logWarn('Error boundary notification handler failed', { hookError });
      }
    }

    return options.fallback;
  }
}

/**
 * Wrap a file system operation in an error boundary.
 * Handles permission errors, not found errors, and other filesystem failures.
 */
export async function withFileSystemErrorBoundary<T>(
  operation: () => Promise<T>,
  options: ErrorBoundaryOptions<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    let fsError: FileSystemError;
    let userMessage = 'File system operation failed';

    if (isPermissionError(error)) {
      const path = (error as NodeJS.ErrnoException).path || 'unknown';
      userMessage = `Permission denied: Cannot access ${path}`;
    } else if (isNotFoundError(error)) {
      const path = (error as NodeJS.ErrnoException).path || 'unknown';
      userMessage = `File not found: ${path}`;
    }

    fsError = error instanceof FileSystemError ? error : new FileSystemError(
      userMessage,
      options.context,
      error instanceof Error ? error : undefined
    );

    const severity = isPermissionError(error) || isNotFoundError(error) ? 'warn' : 'error';
    if (severity === 'warn') {
      logWarn(userMessage, options.context);
    } else {
      logError(userMessage, fsError, options.context);
    }

    if (options.notify && options.onError) {
      try {
        options.onError(fsError);
      } catch (hookError) {
        logWarn('Error boundary notification handler failed', { hookError });
      }
    }

    return options.fallback;
  }
}

/**
 * Wrap a config operation in an error boundary.
 * Validates and provides helpful messages for config errors.
 */
export async function withConfigErrorBoundary<T>(
  operation: () => Promise<T>,
  options: ErrorBoundaryOptions<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const configError = error instanceof ConfigError ? error : new ConfigError(
      'Configuration error',
      options.context,
      error instanceof Error ? error : undefined
    );

    logError('Config error', configError, options.context);

    if (options.notify && options.onError) {
      try {
        options.onError(configError);
      } catch (hookError) {
        logWarn('Error boundary notification handler failed', { hookError });
      }
    }

    return options.fallback;
  }
}

/**
 * Retry an operation with exponential backoff.
 * Useful for transient errors like file locks or network issues.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    backoff = 'exponential',
    baseDelay = 100,
    maxDelay = 5000,
    shouldRetry = isTransientError,
    notify = true,
    onRetry,
  } = options;

  let lastError: unknown;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt++;

      // Check if we should retry
      if (attempt > maxRetries || !shouldRetry(error, attempt)) {
        break;
      }

      // Calculate delay
      let delay = baseDelay;
      if (backoff === 'linear') {
        delay = baseDelay * attempt;
      } else if (backoff === 'exponential') {
        delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      }

      logDebug(`Retrying operation (attempt ${attempt}/${maxRetries}) after ${delay}ms`, {
        error: getUserMessage(error),
      });

      onRetry?.(error, attempt, delay);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  const message = `Operation failed after ${attempt} attempts`;
  logError(message, lastError);

  if (notify) {
    // Caller should handle notification via thrown error
  }

  throw lastError;
}

/**
 * Safely execute an operation with comprehensive error handling.
 * Combines error boundary + retry logic + logging.
 */
export async function safeExecute<T>(
  operation: () => Promise<T>,
  options: {
    fallback: T;
    retry?: RetryOptions;
    boundary?: Omit<ErrorBoundaryOptions<T>, 'fallback'>;
  }
): Promise<T> {
  const boundaryOptions: ErrorBoundaryOptions<T> = {
    fallback: options.fallback,
    ...options.boundary,
  };

  return withFileSystemErrorBoundary(async () => {
    if (options.retry) {
      return await withRetry(operation, options.retry);
    }
    return await operation();
  }, boundaryOptions);
}

/**
 * Create a user-friendly notification from an error.
 */
export function createErrorNotification(
  error: unknown,
  defaultMessage: string = 'An error occurred'
): Notification {
  let message = getUserMessage(error);
  let type: NotificationType = 'error';

  // Downgrade severity for certain error types
  if (isPermissionError(error) || isNotFoundError(error)) {
    type = 'warning';
  }

  // If message is too technical, use default
  if (!message || message.length < 10) {
    message = defaultMessage;
  }

  return { message, type };
}

/**
 * Handle uncaught errors globally.
 * Should be set up in App.tsx on mount.
 */
export function setupGlobalErrorHandler(
  onError: (error: unknown) => void
): () => void {
  // For Node.js CLI apps
  const processErrorHandler = (error: Error) => {
    logError('Uncaught exception', error);
    onError(error);
  };

  const processRejectionHandler = (reason: unknown) => {
    logError('Unhandled rejection', reason);
    onError(reason);
  };

  process.on('uncaughtException', processErrorHandler);
  process.on('unhandledRejection', processRejectionHandler);

  return () => {
    process.off('uncaughtException', processErrorHandler);
    process.off('unhandledRejection', processRejectionHandler);
  };
}
