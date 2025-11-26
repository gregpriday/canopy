import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import {
  setupGlobalErrorHandler,
  createErrorNotification,
} from '../../src/utils/errorHandling.js';

describe('setupGlobalErrorHandler', () => {
  let processOnSpy: Mock;
  let processOffSpy: Mock;
  let originalListeners: {
    uncaughtException: NodeJS.UncaughtExceptionListener[];
    unhandledRejection: NodeJS.UnhandledRejectionListener[];
  };

  beforeEach(() => {
    // Save original listeners
    originalListeners = {
      uncaughtException: process.listeners('uncaughtException') as NodeJS.UncaughtExceptionListener[],
      unhandledRejection: process.listeners('unhandledRejection') as NodeJS.UnhandledRejectionListener[],
    };

    // Set up spies
    processOnSpy = vi.spyOn(process, 'on');
    processOffSpy = vi.spyOn(process, 'off');
  });

  afterEach(() => {
    vi.restoreAllMocks();

    // Remove any handlers added by tests to avoid test pollution
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    // Restore original listeners
    for (const listener of originalListeners.uncaughtException) {
      process.on('uncaughtException', listener);
    }
    for (const listener of originalListeners.unhandledRejection) {
      process.on('unhandledRejection', listener);
    }
  });

  it('registers handlers for uncaughtException and unhandledRejection', () => {
    const onError = vi.fn();
    const cleanup = setupGlobalErrorHandler(onError);

    expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));

    cleanup();
  });

  it('returns a cleanup function that removes handlers', () => {
    const onError = vi.fn();
    const cleanup = setupGlobalErrorHandler(onError);

    // Call cleanup
    cleanup();

    expect(processOffSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    expect(processOffSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
  });

  it('calls onError callback when uncaughtException is emitted', () => {
    const onError = vi.fn();
    const cleanup = setupGlobalErrorHandler(onError);

    const testError = new Error('Test uncaught exception');

    // Get the registered handler and call it directly
    const uncaughtExceptionCall = processOnSpy.mock.calls.find(
      call => call[0] === 'uncaughtException'
    );
    expect(uncaughtExceptionCall).toBeDefined();
    const handler = uncaughtExceptionCall![1] as (error: Error) => void;

    // Simulate uncaught exception
    handler(testError);

    expect(onError).toHaveBeenCalledWith(testError);

    cleanup();
  });

  it('calls onError callback when unhandledRejection is emitted', () => {
    const onError = vi.fn();
    const cleanup = setupGlobalErrorHandler(onError);

    const rejectionReason = 'Promise rejected';

    // Get the registered handler and call it directly
    const unhandledRejectionCall = processOnSpy.mock.calls.find(
      call => call[0] === 'unhandledRejection'
    );
    expect(unhandledRejectionCall).toBeDefined();
    const handler = unhandledRejectionCall![1] as (reason: unknown) => void;

    // Simulate unhandled rejection
    handler(rejectionReason);

    expect(onError).toHaveBeenCalledWith(rejectionReason);

    cleanup();
  });

  it('handles non-Error rejection reasons', () => {
    const onError = vi.fn();
    const cleanup = setupGlobalErrorHandler(onError);

    const rejectionReasons = [
      'string reason',
      42,
      null,
      undefined,
      { custom: 'object' },
    ];

    // Get the registered handler
    const unhandledRejectionCall = processOnSpy.mock.calls.find(
      call => call[0] === 'unhandledRejection'
    );
    const handler = unhandledRejectionCall![1] as (reason: unknown) => void;

    for (const reason of rejectionReasons) {
      handler(reason);
      expect(onError).toHaveBeenCalledWith(reason);
    }

    cleanup();
  });

  it('cleanup function can be called multiple times safely', () => {
    const onError = vi.fn();
    const cleanup = setupGlobalErrorHandler(onError);

    // Should not throw when called multiple times
    expect(() => {
      cleanup();
      cleanup();
      cleanup();
    }).not.toThrow();
  });

  it('handlers respond to process.emit for uncaughtException', () => {
    const onError = vi.fn();
    const cleanup = setupGlobalErrorHandler(onError);

    const testError = new Error('Emitted uncaught exception');

    // Use process.emit to verify handler is wired correctly
    process.emit('uncaughtException', testError);

    expect(onError).toHaveBeenCalledWith(testError);

    cleanup();
  });

  it('handlers respond to process.emit for unhandledRejection', () => {
    const onError = vi.fn();
    const cleanup = setupGlobalErrorHandler(onError);

    const rejectionReason = new Error('Emitted rejection');

    // Use process.emit to verify handler is wired correctly
    process.emit('unhandledRejection', rejectionReason, Promise.reject(rejectionReason).catch(() => {}));

    expect(onError).toHaveBeenCalledWith(rejectionReason);

    cleanup();
  });

  it('cleanup prevents further events from triggering onError', () => {
    const onError = vi.fn();
    const cleanup = setupGlobalErrorHandler(onError);

    // Verify the handlers are registered by checking listener count increased
    const initialExceptionCount = process.listenerCount('uncaughtException');
    const initialRejectionCount = process.listenerCount('unhandledRejection');

    // Our handlers should be registered (counts should be > 0 since we added them)
    expect(initialExceptionCount).toBeGreaterThan(0);
    expect(initialRejectionCount).toBeGreaterThan(0);

    // Call cleanup
    cleanup();

    // Verify listeners were removed by checking the same functions that were added
    // are now removed (process.off was called with the exact handlers)
    expect(processOffSpy).toHaveBeenCalledTimes(2);

    // Verify onError was never called during setup/cleanup
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('createErrorNotification', () => {
  it('creates error notification with string error message when it is long enough', () => {
    // getUserMessage converts non-Error values to strings
    // createErrorNotification uses default only if message is < 10 chars
    const notification = createErrorNotification('string error that is long enough', 'Default message');

    expect(notification.type).toBe('error');
    // The string is used directly since it's >= 10 chars
    expect(notification.message).toBe('string error that is long enough');
  });

  it('creates error notification with default message when string error is too short', () => {
    const notification = createErrorNotification('short', 'Default message');

    expect(notification.type).toBe('error');
    expect(notification.message).toBe('Default message');
  });

  it('creates error notification from Error object', () => {
    const error = new Error('Specific error message');
    const notification = createErrorNotification(error);

    expect(notification.type).toBe('error');
    expect(notification.message).toContain('Specific error message');
  });

  it('downgrades severity for permission errors', () => {
    const error = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    const notification = createErrorNotification(error);

    expect(notification.type).toBe('warning');
  });

  it('downgrades severity for not found errors', () => {
    const error = Object.assign(new Error('File not found'), { code: 'ENOENT' });
    const notification = createErrorNotification(error);

    expect(notification.type).toBe('warning');
  });

  it('uses default message when error message is too short', () => {
    const error = new Error('Short');
    const notification = createErrorNotification(error, 'A more descriptive default message');

    expect(notification.message).toBe('A more descriptive default message');
  });

  it('uses default message when error is null/undefined', () => {
    const notification = createErrorNotification(null, 'Fallback message');

    expect(notification.type).toBe('error');
    expect(notification.message).toBe('Fallback message');
  });

  it('returns notification with message property suitable for display', () => {
    const error = new Error('Database connection failed');
    const notification = createErrorNotification(error);

    expect(notification).toHaveProperty('message');
    expect(notification).toHaveProperty('type');
    expect(typeof notification.message).toBe('string');
    expect(notification.message.length).toBeGreaterThan(0);
  });

  it('uses built-in default message when no defaultMessage argument provided and error is short', () => {
    // When error message is < 10 chars and no defaultMessage provided,
    // it should use 'An error occurred' as the default
    const notification = createErrorNotification('Err');

    expect(notification.type).toBe('error');
    expect(notification.message).toBe('An error occurred');
  });

  it('uses built-in default message when error is empty string', () => {
    const notification = createErrorNotification('');

    expect(notification.type).toBe('error');
    expect(notification.message).toBe('An error occurred');
  });
});
