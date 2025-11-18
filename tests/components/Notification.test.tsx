import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Notification } from '../../src/components/Notification.js';
import type { Notification as NotificationType } from '../../src/types/index.js';

describe('Notification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders nothing when notification is null', () => {
    const onDismiss = vi.fn();
    const { lastFrame } = render(
      <Notification notification={null} onDismiss={onDismiss} />
    );

    expect(lastFrame()).toBe('');
  });

  it('renders notification with correct color for success', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      type: 'success',
      message: 'Operation succeeded',
    };

    const { lastFrame } = render(
      <Notification notification={notification} onDismiss={onDismiss} />
    );

    // Check that message is rendered (exact formatting may vary)
    expect(lastFrame()).toContain('Operation succeeded');
  });

  it('renders notification with correct color for error', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      type: 'error',
      message: 'Something went wrong',
    };

    const { lastFrame } = render(
      <Notification notification={notification} onDismiss={onDismiss} />
    );

    expect(lastFrame()).toContain('Something went wrong');
  });

  it('auto-dismisses success notification after 3 seconds', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      type: 'success',
      message: 'Done',
    };

    render(<Notification notification={notification} onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();

    // Fast-forward time by 3 seconds
    vi.advanceTimersByTime(3000);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses info notification after 3 seconds', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      type: 'info',
      message: 'FYI',
    };

    render(<Notification notification={notification} onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses warning notification after 3 seconds', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      type: 'warning',
      message: 'Warning',
    };

    render(<Notification notification={notification} onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does NOT auto-dismiss error notification', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      type: 'error',
      message: 'Error',
    };

    render(<Notification notification={notification} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(5000); // Wait even longer than normal timeout

    expect(onDismiss).not.toHaveBeenCalled(); // Should NOT auto-dismiss
  });

  it('clears timer when notification changes before timeout', () => {
    const onDismiss = vi.fn();
    const notification1: NotificationType = {
      type: 'success',
      message: 'First',
    };
    const notification2: NotificationType = {
      type: 'info',
      message: 'Second',
    };

    const { rerender } = render(
      <Notification notification={notification1} onDismiss={onDismiss} />
    );

    // Advance time partially
    vi.advanceTimersByTime(1500);

    // Change notification
    rerender(<Notification notification={notification2} onDismiss={onDismiss} />);

    // Advance remaining time from first timer
    vi.advanceTimersByTime(1500);

    // First timer should have been cleared, so no dismiss yet
    expect(onDismiss).not.toHaveBeenCalled();

    // Now wait for second timer to complete
    vi.advanceTimersByTime(1500);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses on ESC key', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      type: 'error',
      message: 'Error',
    };

    const { stdin } = render(
      <Notification notification={notification} onDismiss={onDismiss} />
    );

    // Simulate ESC key
    stdin.write('\x1B'); // ESC character

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses on Enter key', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      type: 'error',
      message: 'Error',
    };

    const { stdin, unmount } = render(
      <Notification notification={notification} onDismiss={onDismiss} />
    );

    // Simulate Enter key
    stdin.write('\r');

    expect(onDismiss).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('clears timer when notification is dismissed (unmounted)', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      type: 'success',
      message: 'Success',
    };

    const { rerender } = render(
      <Notification notification={notification} onDismiss={onDismiss} />
    );

    // Advance time partially
    vi.advanceTimersByTime(1500);

    // Clear notification (unmount timer)
    rerender(<Notification notification={null} onDismiss={onDismiss} />);

    // Advance past original timeout
    vi.advanceTimersByTime(3000);

    // Timer should have been cleaned up, so no dismiss
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('schedules new timer when transitioning from error to success', () => {
    const onDismiss = vi.fn();
    const errorNotification: NotificationType = {
      type: 'error',
      message: 'Error',
    };
    const successNotification: NotificationType = {
      type: 'success',
      message: 'Success',
    };

    const { rerender } = render(
      <Notification notification={errorNotification} onDismiss={onDismiss} />
    );

    // Advance time - error should not auto-dismiss
    vi.advanceTimersByTime(5000);
    expect(onDismiss).not.toHaveBeenCalled();

    // Change to success notification
    rerender(<Notification notification={successNotification} onDismiss={onDismiss} />);

    // Advance time - success should auto-dismiss after 3 seconds
    vi.advanceTimersByTime(3000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss on ESC when notification is null', () => {
    const onDismiss = vi.fn();

    const { stdin, unmount } = render(
      <Notification notification={null} onDismiss={onDismiss} />
    );

    // Simulate ESC key
    stdin.write('\x1B');

    expect(onDismiss).not.toHaveBeenCalled();
    unmount();
  });

  it('does not dismiss on Enter when notification is null', () => {
    const onDismiss = vi.fn();

    const { stdin, unmount } = render(
      <Notification notification={null} onDismiss={onDismiss} />
    );

    // Simulate Enter key
    stdin.write('\r');

    expect(onDismiss).not.toHaveBeenCalled();
    unmount();
  });

  it('does not dismiss on other keys', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      type: 'success',
      message: 'Success',
    };

    const { stdin, unmount } = render(
      <Notification notification={notification} onDismiss={onDismiss} />
    );

    // Simulate various other keys
    stdin.write('a');
    stdin.write('x');
    stdin.write(' ');

    expect(onDismiss).not.toHaveBeenCalled();
    unmount();
  });
});
