/**
 * Custom error types for Yellowwood with context and severity.
 * Enables better error handling, logging, and user notifications.
 */

/**
 * Base error class for all Yellowwood errors.
 * Includes context for better debugging and user messages.
 */
export class YellowwoodError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Git operation failed (repository not found, git not installed, command failed)
 */
export class GitError extends YellowwoodError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, context, cause);
  }
}

/**
 * File system operation failed (permission denied, file not found, read error)
 */
export class FileSystemError extends YellowwoodError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, context, cause);
  }
}

/**
 * Configuration loading or validation failed
 */
export class ConfigError extends YellowwoodError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, context, cause);
  }
}

/**
 * External process execution failed (editor not found, command error)
 */
export class ProcessError extends YellowwoodError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, context, cause);
  }
}

/**
 * File watcher setup or operation failed
 */
export class WatcherError extends YellowwoodError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(message, context, cause);
  }
}

/**
 * Check if error is a specific Yellowwood error type
 */
export function isYellowwoodError(error: unknown): error is YellowwoodError {
  return error instanceof YellowwoodError;
}

/**
 * Check if error is a permission/access error (EACCES, EPERM)
 */
export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EACCES' || code === 'EPERM';
}

/**
 * Check if error is a "not found" error (ENOENT)
 */
export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * Check if error is a transient error that might succeed on retry
 */
export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as NodeJS.ErrnoException).code;
  // File busy, resource temporarily unavailable, etc.
  return ['EBUSY', 'EAGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'].includes(code || '');
}

/**
 * Extract user-friendly message from any error
 */
export function getUserMessage(error: unknown): string {
  if (isYellowwoodError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Extract technical details for logging
 * Handles circular references safely to prevent infinite recursion
 */
export function getErrorDetails(error: unknown, seen = new WeakSet<Error>()): Record<string, unknown> {
  const details: Record<string, unknown> = {
    message: getUserMessage(error),
  };

  if (error instanceof Error) {
    details.name = error.name;
    details.stack = error.stack;
  }

  if (isYellowwoodError(error)) {
    details.context = error.context;
    if (error.cause) {
      // Prevent circular reference stack overflow
      if (error.cause instanceof Error && !seen.has(error.cause)) {
        seen.add(error.cause);
        details.cause = getErrorDetails(error.cause, seen);
      } else if (!(error.cause instanceof Error)) {
        // Handle non-Error causes
        details.cause = getErrorDetails(error.cause, seen);
      }
    }
  }

  if (error && typeof error === 'object') {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code) details.code = nodeError.code;
    if (nodeError.errno) details.errno = nodeError.errno;
    if (nodeError.syscall) details.syscall = nodeError.syscall;
    if (nodeError.path) details.path = nodeError.path;
  }

  return details;
}
