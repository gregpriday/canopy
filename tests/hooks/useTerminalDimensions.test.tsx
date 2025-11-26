import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Box, Text } from 'ink';
import { useTerminalDimensions, useTerminalResizeEvent } from '../../src/hooks/useTerminalDimensions.js';
import type { TerminalDimensions } from '../../src/types/index.js';
import { events } from '../../src/services/events.js';

// Mock useStdout from Ink
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    useStdout: vi.fn(),
  };
});

import { useStdout } from 'ink';

// Test component that uses the hook and displays dimensions
function TestComponent({ options = {} }: { options?: Parameters<typeof useTerminalDimensions>[0] }) {
  const dimensions = useTerminalDimensions(options);
  return (
    <Box>
      <Text>Width: {dimensions.width}, Height: {dimensions.height}</Text>
    </Box>
  );
}

// Test component for resize event hook
function ResizeEventComponent({ callback }: { callback: (dimensions: TerminalDimensions) => void }) {
  useTerminalResizeEvent(callback);
  return (
    <Box>
      <Text>Listening for resize events</Text>
    </Box>
  );
}

describe('useTerminalDimensions', () => {
  let mockStdout: {
    columns: number;
    rows: number;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockStdout = {
      columns: 120,
      rows: 40,
      on: vi.fn(),
      off: vi.fn(),
    };
    vi.mocked(useStdout).mockReturnValue({ stdout: mockStdout as any, write: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    events.removeAllListeners();
  });

  it('returns initial dimensions from stdout', () => {
    const { lastFrame } = render(<TestComponent />);

    // Height should be reduced by 1 for scroll jitter prevention
    expect(lastFrame()).toContain('Width: 120');
    expect(lastFrame()).toContain('Height: 39');
  });

  it('returns default dimensions when stdout is unavailable', () => {
    vi.mocked(useStdout).mockReturnValue({ stdout: null as any, write: vi.fn() });

    const { lastFrame } = render(<TestComponent />);

    expect(lastFrame()).toContain('Width: 80');
    expect(lastFrame()).toContain('Height: 24');
  });

  it('enforces minimum dimensions', () => {
    mockStdout.columns = 20; // Below minimum of 40
    mockStdout.rows = 5; // Below minimum of 10

    const { lastFrame } = render(<TestComponent />);

    expect(lastFrame()).toContain('Width: 40');
    expect(lastFrame()).toContain('Height: 10');
  });

  it('subscribes to resize events', () => {
    render(<TestComponent />);

    expect(mockStdout.on).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('unsubscribes from resize events on unmount', () => {
    const { unmount } = render(<TestComponent />);

    unmount();

    expect(mockStdout.off).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('debounces resize events', async () => {
    const { lastFrame, rerender } = render(<TestComponent />);

    // Get the resize handler
    const resizeHandler = mockStdout.on.mock.calls[0][1];

    // Simulate resize
    mockStdout.columns = 100;
    mockStdout.rows = 30;

    resizeHandler();

    // Dimensions should not have changed yet (debounce active)
    expect(lastFrame()).toContain('Width: 120');

    // Fast-forward past the debounce period
    vi.advanceTimersByTime(60);

    // Trigger rerender to reflect state changes
    rerender(<TestComponent />);

    // Now dimensions should be updated
    expect(lastFrame()).toContain('Width: 100');
    expect(lastFrame()).toContain('Height: 29'); // rows - 1
  });

  it('emits sys:terminal:resize event after debounce', async () => {
    const eventSpy = vi.fn();
    events.on('sys:terminal:resize', eventSpy);

    render(<TestComponent />);

    // Get the resize handler
    const resizeHandler = mockStdout.on.mock.calls[0][1];

    // Simulate resize
    mockStdout.columns = 100;
    mockStdout.rows = 30;

    resizeHandler();

    // Event should not have been emitted yet (debounce active)
    expect(eventSpy).not.toHaveBeenCalled();

    // Fast-forward past the debounce period
    vi.advanceTimersByTime(60);

    // Event should now be emitted
    expect(eventSpy).toHaveBeenCalledWith({ width: 100, height: 29 });
  });

  it('does not emit events when emitEvents is false', async () => {
    const eventSpy = vi.fn();
    events.on('sys:terminal:resize', eventSpy);

    render(<TestComponent options={{ emitEvents: false }} />);

    // Get the resize handler
    const resizeHandler = mockStdout.on.mock.calls[0][1];

    // Simulate resize
    mockStdout.columns = 100;
    mockStdout.rows = 30;

    resizeHandler();
    vi.advanceTimersByTime(60);

    // Event should not have been emitted
    expect(eventSpy).not.toHaveBeenCalled();
  });

  it('clears debounce timer on rapid resize events', async () => {
    const { lastFrame, rerender } = render(<TestComponent />);

    const resizeHandler = mockStdout.on.mock.calls[0][1];

    // First resize
    mockStdout.columns = 100;
    mockStdout.rows = 30;
    resizeHandler();

    // Wait a bit but not past debounce
    vi.advanceTimersByTime(30);

    // Second resize (should reset the debounce)
    mockStdout.columns = 80;
    mockStdout.rows = 25;
    resizeHandler();

    // Wait past the original debounce time
    vi.advanceTimersByTime(30);
    rerender(<TestComponent />);

    // Should still not have updated (new debounce still active)
    expect(lastFrame()).toContain('Width: 120');

    // Wait for the new debounce to complete
    vi.advanceTimersByTime(30);
    rerender(<TestComponent />);

    // Now should have the latest values
    expect(lastFrame()).toContain('Width: 80');
    expect(lastFrame()).toContain('Height: 24'); // 25 - 1
  });
});

describe('useTerminalResizeEvent', () => {
  beforeEach(() => {
    events.removeAllListeners();
    vi.mocked(useStdout).mockReturnValue({
      stdout: { columns: 80, rows: 24, on: vi.fn(), off: vi.fn() } as any,
      write: vi.fn(),
    });
  });

  afterEach(() => {
    events.removeAllListeners();
  });

  it('subscribes to sys:terminal:resize events', () => {
    const callback = vi.fn();

    render(<ResizeEventComponent callback={callback} />);

    // Emit a resize event
    events.emit('sys:terminal:resize', { width: 100, height: 30 });

    expect(callback).toHaveBeenCalledWith({ width: 100, height: 30 });
  });

  it('unsubscribes on unmount', () => {
    const callback = vi.fn();

    const { unmount } = render(<ResizeEventComponent callback={callback} />);
    unmount();

    // Emit a resize event after unmount
    events.emit('sys:terminal:resize', { width: 100, height: 30 });

    expect(callback).not.toHaveBeenCalled();
  });
});
