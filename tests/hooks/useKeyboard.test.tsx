import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { useKeyboard, type KeyboardHandlers } from '../../src/hooks/useKeyboard.js';
import { Box, Text } from 'ink';

// Test component that uses the hook
function TestComponent({ handlers }: { handlers: KeyboardHandlers }) {
  useKeyboard(handlers);
  return (
    <Box>
      <Text>Test</Text>
    </Box>
  );
}

// Helper to wait for Ink to finish mounting and attach stdin listener
async function waitForInk(stdin: NodeJS.ReadableStream, hasHomeEndHandlers = false) {
  // Wait until Ink has attached the 'readable' listener
  let attempts = 0;
  while (stdin.listenerCount('readable') === 0 && attempts < 50) {
    await new Promise(resolve => setTimeout(resolve, 10));
    attempts++;
  }

  // If Home/End handlers are present, also wait for the 'data' listener
  if (hasHomeEndHandlers) {
    attempts = 0;
    while (stdin.listenerCount('data') === 0 && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 10));
      attempts++;
    }
  }

  // Give one more microtask for the hook to fully initialize
  await new Promise(resolve => setTimeout(resolve, 0));
}

// Helper to write to stdin and wait for processing
async function writeKey(stdin: NodeJS.WriteStream & { write(chunk: any): boolean }, key: string) {
  stdin.write(key);
  // Wait a microtask for batched updates to complete
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('useKeyboard', () => {
  describe('navigation keys', () => {
    it('calls onNavigateUp when up arrow is pressed', async () => {
      const onNavigateUp = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onNavigateUp }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x1B[A'); // Up arrow ANSI code

      expect(onNavigateUp).toHaveBeenCalledTimes(1);
    });

    it('calls onNavigateDown when down arrow is pressed', async () => {
      const onNavigateDown = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onNavigateDown }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x1B[B'); // Down arrow

      expect(onNavigateDown).toHaveBeenCalledTimes(1);
    });

    it('calls onNavigateLeft when left arrow is pressed', async () => {
      const onNavigateLeft = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onNavigateLeft }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x1B[D'); // Left arrow

      expect(onNavigateLeft).toHaveBeenCalledTimes(1);
    });

    it('calls onNavigateRight when right arrow is pressed', async () => {
      const onNavigateRight = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onNavigateRight }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x1B[C'); // Right arrow

      expect(onNavigateRight).toHaveBeenCalledTimes(1);
    });

    it('calls onPageUp when PageUp is pressed', async () => {
      const onPageUp = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onPageUp }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x1B[5~'); // PageUp

      expect(onPageUp).toHaveBeenCalledTimes(1);
    });

    it('calls onPageDown when PageDown is pressed', async () => {
      const onPageDown = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onPageDown }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x1B[6~'); // PageDown

      expect(onPageDown).toHaveBeenCalledTimes(1);
    });

    it('calls onPageUp when Ctrl+U is pressed', async () => {
      const onPageUp = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onPageUp }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x15'); // Ctrl+U

      expect(onPageUp).toHaveBeenCalledTimes(1);
    });

    it('calls onPageDown when Ctrl+D is pressed', async () => {
      const onPageDown = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onPageDown }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x04'); // Ctrl+D

      expect(onPageDown).toHaveBeenCalledTimes(1);
    });

    it('calls onHome when Home is pressed', async () => {
      const onHome = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onHome }} />);
      await waitForInk(stdin, true);

      await writeKey(stdin, '\x1B[H'); // Home

      expect(onHome).toHaveBeenCalledTimes(1);
    });

    it('calls onEnd when End is pressed', async () => {
      const onEnd = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onEnd }} />);
      await waitForInk(stdin, true);

      await writeKey(stdin, '\x1B[F'); // End

      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('calls onHome with alternate sequence (\\u001BOH)', async () => {
      const onHome = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onHome }} />);
      await waitForInk(stdin, true);

      await writeKey(stdin, '\u001BOH'); // Alternate Home sequence

      expect(onHome).toHaveBeenCalledTimes(1);
    });

    it('calls onHome with alternate sequence (\\u001B[1~)', async () => {
      const onHome = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onHome }} />);
      await waitForInk(stdin, true);

      await writeKey(stdin, '\u001B[1~'); // Alternate Home sequence

      expect(onHome).toHaveBeenCalledTimes(1);
    });

    it('calls onEnd with alternate sequence (\\u001BOF)', async () => {
      const onEnd = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onEnd }} />);
      await waitForInk(stdin, true);

      await writeKey(stdin, '\u001BOF'); // Alternate End sequence

      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('calls onEnd with alternate sequence (\\u001B[4~)', async () => {
      const onEnd = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onEnd }} />);
      await waitForInk(stdin, true);

      await writeKey(stdin, '\u001B[4~'); // Alternate End sequence

      expect(onEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('file/folder actions', () => {
    it('calls onOpenFile when Enter is pressed', async () => {
      const onOpenFile = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onOpenFile }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\r'); // Enter

      expect(onOpenFile).toHaveBeenCalledTimes(1);
    });

    it('calls onToggleExpand when Space is pressed', async () => {
      const onToggleExpand = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onToggleExpand }} />);
      await waitForInk(stdin);

      await writeKey(stdin, ' '); // Space

      expect(onToggleExpand).toHaveBeenCalledTimes(1);
    });
  });

  describe('worktree actions', () => {
    it('calls onNextWorktree when w is pressed', async () => {
      const onNextWorktree = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onNextWorktree }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'w');

      expect(onNextWorktree).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenWorktreePanel when Shift+W is pressed', async () => {
      const onOpenWorktreePanel = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onOpenWorktreePanel }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'W'); // Shift+W produces uppercase W

      expect(onOpenWorktreePanel).toHaveBeenCalledTimes(1);
    });
  });

  describe('command/filter actions', () => {
    it('calls onOpenCommandBar when / is pressed', async () => {
      const onOpenCommandBar = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onOpenCommandBar }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '/');

      expect(onOpenCommandBar).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenFilter when Ctrl+F is pressed', async () => {
      const onOpenFilter = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onOpenFilter }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x06'); // Ctrl+F

      expect(onOpenFilter).toHaveBeenCalledTimes(1);
    });

    it('calls onClearFilter when ESC is pressed', async () => {
      const onClearFilter = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onClearFilter }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x1B'); // ESC

      expect(onClearFilter).toHaveBeenCalledTimes(1);
    });
  });

  describe('git actions', () => {
    it('calls onToggleGitStatus when g is pressed', async () => {
      const onToggleGitStatus = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onToggleGitStatus }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'g');

      expect(onToggleGitStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('copy actions', () => {
    it('calls onCopyPath when c is pressed', async () => {
      const onCopyPath = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onCopyPath }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'c');

      expect(onCopyPath).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenCopyTreeBuilder when Shift+C is pressed', async () => {
      const onOpenCopyTreeBuilder = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onOpenCopyTreeBuilder }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'C'); // Shift+C produces uppercase C

      expect(onOpenCopyTreeBuilder).toHaveBeenCalledTimes(1);
    });
  });

  describe('ui actions', () => {
    it('calls onRefresh when r is pressed', async () => {
      const onRefresh = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onRefresh }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'r');

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenHelp when ? is pressed', async () => {
      const onOpenHelp = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onOpenHelp }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '?');

      expect(onOpenHelp).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenContextMenu when m is pressed', async () => {
      const onOpenContextMenu = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onOpenContextMenu }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'm');

      expect(onOpenContextMenu).toHaveBeenCalledTimes(1);
    });

    it('calls onQuit when q is pressed', async () => {
      const onQuit = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onQuit }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'q');

      expect(onQuit).toHaveBeenCalledTimes(1);
    });
  });

  describe('optional handlers', () => {
    it('does not crash when handler is not provided', async () => {
      const { stdin } = render(<TestComponent handlers={{}} />);
      await waitForInk(stdin);

      // Should not throw
      expect(() => stdin.write('g')).not.toThrow();
      expect(() => stdin.write('q')).not.toThrow();
      expect(() => stdin.write('\r')).not.toThrow();
    });

    it('only calls provided handlers', async () => {
      const onNavigateUp = vi.fn();
      // onNavigateDown not provided
      const { stdin } = render(<TestComponent handlers={{ onNavigateUp }} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x1B[A'); // Up arrow
      await writeKey(stdin, '\x1B[B'); // Down arrow

      expect(onNavigateUp).toHaveBeenCalledTimes(1); // Called
      // onNavigateDown would not be called because not provided
    });
  });

  describe('key conflicts', () => {
    it('does not call onNextWorktree when Shift+W is pressed', async () => {
      const onNextWorktree = vi.fn();
      const onOpenWorktreePanel = vi.fn();
      const { stdin } = render(
        <TestComponent handlers={{ onNextWorktree, onOpenWorktreePanel }} />
      );
      await waitForInk(stdin);

      await writeKey(stdin, 'W'); // Shift+W

      expect(onNextWorktree).not.toHaveBeenCalled(); // Should NOT be called
      expect(onOpenWorktreePanel).toHaveBeenCalledTimes(1); // This should be called
    });

    it('does not call onCopyPath when Shift+C is pressed', async () => {
      const onCopyPath = vi.fn();
      const onOpenCopyTreeBuilder = vi.fn();
      const { stdin } = render(
        <TestComponent handlers={{ onCopyPath, onOpenCopyTreeBuilder }} />
      );
      await waitForInk(stdin);

      await writeKey(stdin, 'C'); // Shift+C

      expect(onCopyPath).not.toHaveBeenCalled(); // Should NOT be called
      expect(onOpenCopyTreeBuilder).toHaveBeenCalledTimes(1); // This should be called
    });
  });

  describe('unknown keys', () => {
    it('ignores keys with no handler', async () => {
      const onNavigateUp = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onNavigateUp }} />);
      await waitForInk(stdin);

      stdin.write('x'); // Unknown key
      stdin.write('y'); // Unknown key
      stdin.write('1'); // Unknown key

      expect(onNavigateUp).not.toHaveBeenCalled();
      // No crash - just ignored
    });
  });

  describe('modifier key requirements', () => {
    it('does not call onPageUp when plain u is pressed (requires Ctrl+U)', async () => {
      const onPageUp = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onPageUp }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'u'); // Plain u without Ctrl

      expect(onPageUp).not.toHaveBeenCalled();
    });

    it('does not call onPageDown when plain d is pressed (requires Ctrl+D)', async () => {
      const onPageDown = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onPageDown }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'd'); // Plain d without Ctrl

      expect(onPageDown).not.toHaveBeenCalled();
    });

    it('does not call onOpenFilter when plain f is pressed (requires Ctrl+F)', async () => {
      const onOpenFilter = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onOpenFilter }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'f'); // Plain f without Ctrl

      expect(onOpenFilter).not.toHaveBeenCalled();
    });
  });

  describe('cleanup and unmount', () => {
    it('removes Home/End data listener on unmount', async () => {
      const onHome = vi.fn();
      const { stdin, unmount } = render(<TestComponent handlers={{ onHome }} />);
      await waitForInk(stdin, true);

      const dataListenerCount = stdin.listenerCount('data');
      expect(dataListenerCount).toBeGreaterThan(0); // Listener attached

      unmount();

      // After unmount, data listener should be removed
      expect(stdin.listenerCount('data')).toBeLessThan(dataListenerCount);
    });

    it('does not call old handler after rerender with new handler', async () => {
      const oldHandler = vi.fn();
      const newHandler = vi.fn();

      const { stdin, rerender } = render(<TestComponent handlers={{ onHome: oldHandler }} />);
      await waitForInk(stdin, true);

      // Rerender with new handler
      rerender(<TestComponent handlers={{ onHome: newHandler }} />);
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for effect cleanup

      await writeKey(stdin, '\x1B[H'); // Home

      expect(oldHandler).not.toHaveBeenCalled(); // Old handler should not fire
      expect(newHandler).toHaveBeenCalledTimes(1); // New handler should fire
    });

    it('stops responding to keys after unmount', async () => {
      const onQuit = vi.fn();
      const { stdin, unmount } = render(<TestComponent handlers={{ onQuit }} />);
      await waitForInk(stdin);

      unmount();

      await writeKey(stdin, 'q'); // Try to trigger after unmount

      expect(onQuit).not.toHaveBeenCalled();
    });
  });
});
