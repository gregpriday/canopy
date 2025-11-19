/**
 * Structured logging utilities for Yellowwood.
 * Uses console.log/warn/error with consistent formatting.
 */

import { getErrorDetails } from './errorTypes.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

// Sensitive keys that should be redacted from logs
const SENSITIVE_KEYS = new Set(['token', 'password', 'apiKey', 'secret', 'accessToken', 'refreshToken']);

/**
 * Safely stringify values, handling circular references and sensitive data
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (key, val) => {
        // Redact sensitive keys
        if (SENSITIVE_KEYS.has(key)) return '[redacted]';

        // Handle BigInt
        if (typeof val === 'bigint') return val.toString();

        // Handle circular references
        if (val && typeof val === 'object') {
          if (seen.has(val as object)) return '[Circular]';
          seen.add(val as object);
        }

        return val;
      },
      2
    );
  } catch (error) {
    // Fallback if JSON.stringify fails
    return `[Unable to stringify: ${String(error)}]`;
  }
}

/**
 * Log a debug message (development only, filtered in production)
 */
export function logDebug(message: string, context?: LogContext): void {
  if (process.env.NODE_ENV === 'development' || process.env.YELLOWWOOD_DEBUG) {
    console.log(`[DEBUG] ${message}`, context ? safeStringify(context) : '');
  }
}

/**
 * Log an info message
 */
export function logInfo(message: string, context?: LogContext): void {
  console.log(`[INFO] ${message}`, context ? safeStringify(context) : '');
}

/**
 * Log a warning message
 */
export function logWarn(message: string, context?: LogContext): void {
  console.warn(`[WARN] ${message}`, context ? safeStringify(context) : '');
}

/**
 * Log an error message
 */
export function logError(message: string, error?: unknown, context?: LogContext): void {
  const errorDetails = error ? getErrorDetails(error) : undefined;
  console.error(
    `[ERROR] ${message}`,
    errorDetails ? safeStringify(errorDetails) : '',
    context ? safeStringify(context) : ''
  );
}
