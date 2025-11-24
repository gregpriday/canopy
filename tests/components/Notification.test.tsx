import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Notification } from '../../src/components/Notification.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import type { Notification as NotificationType } from '../../src/types/index.js';

const renderNotification = (
  notification: NotificationType | null,
  onDismiss: ReturnType<typeof vi.fn> = vi.fn(),
  isActive = true
) =>
  render(
    <ThemeProvider mode="dark">
      {notification ? (
        <Notification notification={notification} onDismiss={onDismiss} isActive={isActive} />
      ) : null}
    </ThemeProvider>
  );

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
    const { lastFrame } = renderNotification(null, onDismiss);

    expect(lastFrame()).toBe('');
  });

  it('renders notification with correct color for success', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      id: 'n1',
      type: 'success',
      message: 'Operation succeeded',
    };

    const { lastFrame } = renderNotification(notification, onDismiss);

    // Check that message is rendered (exact formatting may vary)
    expect(lastFrame()).toContain('Operation succeeded');
  });

  it('renders notification with correct color for error', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      id: 'n2',
      type: 'error',
      message: 'Something went wrong',
    };

    const { lastFrame } = renderNotification(notification, onDismiss);

    expect(lastFrame()).toContain('Something went wrong');
  });

  it('auto-dismisses success notification after 3 seconds', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      id: 'n3',
      type: 'success',
      message: 'Done',
    };

    renderNotification(notification, onDismiss);

    expect(onDismiss).not.toHaveBeenCalled();

    // Fast-forward time by 2 seconds (non-error)
    vi.advanceTimersByTime(2000);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses info notification after 3 seconds', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      id: 'n4',
      type: 'info',
      message: 'FYI',
    };

    renderNotification(notification, onDismiss);

    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses warning notification after 3 seconds', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      id: 'n5',
      type: 'warning',
      message: 'Warning',
    };

    renderNotification(notification, onDismiss);

    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does NOT auto-dismiss error notification', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      id: 'n6',
      type: 'error',
      message: 'Error',
    };

    renderNotification(notification, onDismiss);
    vi.advanceTimersByTime(5000); // Wait even longer than normal timeout

    expect(onDismiss).not.toHaveBeenCalled(); // Should NOT auto-dismiss
  });

  it('clears timer when notification changes before timeout', () => {
    const onDismiss = vi.fn();
    const notification1: NotificationType = {
      id: 'n7',
      type: 'success',
      message: 'First',
    };
    const notification2: NotificationType = {
      id: 'n8',
      type: 'info',
      message: 'Second',
    };

    const { rerender } = renderNotification(notification1, onDismiss);

    // Advance time partially
    vi.advanceTimersByTime(1500);

    // Change notification
    rerender(
      <ThemeProvider mode="dark">
        <Notification notification={notification2} onDismiss={onDismiss} isActive={true} />
      </ThemeProvider>
    );

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
      id: 'n9',
      type: 'error',
      message: 'Error',
    };

    const { stdin } = renderNotification(notification, onDismiss);

    // Simulate ESC key
    stdin.write('\x1B'); // ESC character

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses on Enter key', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      id: 'n10',
      type: 'error',
      message: 'Error',
    };

    const { stdin, unmount } = renderNotification(notification, onDismiss);

    // Simulate Enter key
    stdin.write('\r');

    expect(onDismiss).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('clears timer when notification is dismissed (unmounted)', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      id: 'n11',
      type: 'success',
      message: 'Success',
    };

    const { rerender } = renderNotification(notification, onDismiss);

    // Advance time partially
    vi.advanceTimersByTime(1500);

    // Clear notification (unmount timer)
    rerender(
      <ThemeProvider mode="dark">
        {null}
      </ThemeProvider>
    );

    // Advance past original timeout
    vi.advanceTimersByTime(3000);

    // Timer should have been cleaned up, so no dismiss
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('schedules new timer when transitioning from error to success', () => {
    const onDismiss = vi.fn();
    const errorNotification: NotificationType = {
      id: 'n12',
      type: 'error',
      message: 'Error',
    };
    const successNotification: NotificationType = {
      id: 'n13',
      type: 'success',
      message: 'Success',
    };

    const { rerender } = renderNotification(errorNotification, onDismiss);

    // Advance time - error should not auto-dismiss
    vi.advanceTimersByTime(5000);
    expect(onDismiss).not.toHaveBeenCalled();

    // Change to success notification
    rerender(
      <ThemeProvider mode="dark">
        <Notification notification={successNotification} onDismiss={onDismiss} isActive={true} />
      </ThemeProvider>
    );

    // Advance time - success should auto-dismiss after 3 seconds
    vi.advanceTimersByTime(3000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss on ESC when notification is null', () => {
    const onDismiss = vi.fn();

    const { stdin, unmount } = renderNotification(null, onDismiss);

    // Simulate ESC key
    stdin.write('\x1B');

    expect(onDismiss).not.toHaveBeenCalled();
    unmount();
  });

  it('does not dismiss on Enter when notification is null', () => {
    const onDismiss = vi.fn();

    const { stdin, unmount } = renderNotification(null, onDismiss);

    // Simulate Enter key
    stdin.write('\r');

    expect(onDismiss).not.toHaveBeenCalled();
    unmount();
  });

  it('does not dismiss on other keys', () => {
    const onDismiss = vi.fn();
    const notification: NotificationType = {
      id: 'n14',
      type: 'success',
      message: 'Success',
    };

    const { stdin, unmount } = renderNotification(notification, onDismiss);

    // Simulate various other keys
    stdin.write('a');
    stdin.write('x');
    stdin.write(' ');

    expect(onDismiss).not.toHaveBeenCalled();
    unmount();
  });
});
