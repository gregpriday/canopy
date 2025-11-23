import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { useKeyboard, type KeyboardHandlers } from '../../src/hooks/useKeyboard.js';
import { Box, Text } from 'ink';
import { events } from '../../src/services/events.js';
import type { CanopyEventMap } from '../../src/services/events.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';

// Test component that uses the hook
function TestComponent({ handlers }: { handlers: KeyboardHandlers }) {
  useKeyboard(handlers, DEFAULT_CONFIG);
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

const listen = <K extends keyof CanopyEventMap>(event: K) => {
  const spy = vi.fn<(payload: CanopyEventMap[K]) => void>();
  const unsubscribe = events.on(event, spy);
  return { spy, unsubscribe };
};

describe('useKeyboard', () => {
  describe('navigation keys', () => {
    it('emits nav:move for arrow keys', async () => {
      const { spy, unsubscribe } = listen('nav:move');
      const { stdin } = render(<TestComponent handlers={{}} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x1B[A');
      await writeKey(stdin, '\x1B[B');
      await writeKey(stdin, '\x1B[D');
      await writeKey(stdin, '\x1B[C');

      expect(spy).toHaveBeenCalledWith({ direction: 'up' });
      expect(spy).toHaveBeenCalledWith({ direction: 'down' });
      expect(spy).toHaveBeenCalledWith({ direction: 'left' });
      expect(spy).toHaveBeenCalledWith({ direction: 'right' });
      unsubscribe();
    });

    it('emits nav:move for paging and home/end sequences', async () => {
      const { spy, unsubscribe } = listen('nav:move');
      const { stdin } = render(<TestComponent handlers={{}} />);
      await waitForInk(stdin, true);

      await writeKey(stdin, '\x1B[5~');
      await writeKey(stdin, '\x1B[6~');
      await writeKey(stdin, '\x15');
      await writeKey(stdin, '\x04');
      await writeKey(stdin, '\x1B[H');
      await writeKey(stdin, '\x1B[F');
      await writeKey(stdin, '\u001BOH');
      await writeKey(stdin, '\u001BOF');

      expect(spy).toHaveBeenCalledWith({ direction: 'pageUp' });
      expect(spy).toHaveBeenCalledWith({ direction: 'pageDown' });
      expect(spy).toHaveBeenCalledWith({ direction: 'home' });
      expect(spy).toHaveBeenCalledWith({ direction: 'end' });
      unsubscribe();
    });
  });

  describe('file/folder actions', () => {
    it('emits nav:primary when Enter is pressed', async () => {
      const { spy, unsubscribe } = listen('nav:primary');
      const { stdin } = render(<TestComponent handlers={{}} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\r');

      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0]).toEqual([]);
      unsubscribe();
    });

    it('calls onToggleExpand when Space is pressed', async () => {
      const onToggleExpand = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onToggleExpand }} />);
      await waitForInk(stdin);

      await writeKey(stdin, ' ');

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

    it('emits modal open for worktree panel when Shift+W is pressed', async () => {
      const { spy, unsubscribe } = listen('ui:modal:open');
      const { stdin } = render(<TestComponent handlers={{}} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'W'); // Shift+W produces uppercase W

      expect(spy).toHaveBeenCalledWith({ id: 'worktree', context: undefined });
      unsubscribe();
    });
  });

  describe('command/filter actions', () => {
    it('emits modal open for fuzzy search when / is pressed', async () => {
      const { spy, unsubscribe } = listen('ui:modal:open');
      const { stdin } = render(<TestComponent handlers={{}} />);
      await waitForInk(stdin);

      await writeKey(stdin, '/');

      expect(spy).toHaveBeenCalledWith({ id: 'fuzzy-search', context: { initialQuery: '' } });
      unsubscribe();
    });

    it('emits modal open with filter context when Ctrl+F is pressed', async () => {
      const { spy, unsubscribe } = listen('ui:modal:open');
      const { stdin } = render(<TestComponent handlers={{}} />);
      await waitForInk(stdin);

      await writeKey(stdin, '\x06'); // Ctrl+F

      expect(spy).toHaveBeenCalledWith({ id: 'command-bar', context: { initialInput: '/filter ' } });
      unsubscribe();
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

    it('emits modal open when ? is pressed', async () => {
      const { spy, unsubscribe } = listen('ui:modal:open');
      const { stdin } = render(<TestComponent handlers={{}} />);
      await waitForInk(stdin);

      await writeKey(stdin, '?');

      expect(spy).toHaveBeenCalledWith({ id: 'help', context: undefined });
      unsubscribe();
    });

    it('emits modal open for context menu when m is pressed', async () => {
      const { spy, unsubscribe } = listen('ui:modal:open');
      const { stdin } = render(<TestComponent handlers={{}} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'm');

      expect(spy).toHaveBeenCalledWith({ id: 'context-menu', context: undefined });
      unsubscribe();
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

      expect(() => stdin.write('g')).not.toThrow();
      expect(() => stdin.write('q')).not.toThrow();
      expect(() => stdin.write('\\r')).not.toThrow();
    });
  });

  describe('key conflicts', () => {
    it('does not call onNextWorktree when Shift+W is pressed', async () => {
      const onNextWorktree = vi.fn();
      const { spy, unsubscribe } = listen('ui:modal:open');
      const { stdin } = render(
        <TestComponent handlers={{ onNextWorktree }} />
      );
      await waitForInk(stdin);

      await writeKey(stdin, 'W'); // Shift+W

      expect(onNextWorktree).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith({ id: 'worktree', context: undefined });
      unsubscribe();
    });

    it('does not call onCopyPath when Shift+C is pressed', async () => {
      const onCopyPath = vi.fn();
      const onOpenCopyTreeBuilder = vi.fn();
      const { stdin } = render(
        <TestComponent handlers={{ onCopyPath, onOpenCopyTreeBuilder }} />
      );
      await waitForInk(stdin);

      await writeKey(stdin, 'C');

      expect(onCopyPath).not.toHaveBeenCalled();
      expect(onOpenCopyTreeBuilder).toHaveBeenCalledTimes(1);
    });
  });

  describe('unknown keys', () => {
    it('ignores keys with no handler', async () => {
      const { stdin } = render(<TestComponent handlers={{}} />);
      await waitForInk(stdin);

      stdin.write('x');
      stdin.write('y');
      stdin.write('1');
    });
  });

  describe('modifier key requirements', () => {
    it('does not call onPageUp when plain u is pressed (requires Ctrl+U)', async () => {
      const onPageUp = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onPageUp }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'u');

      expect(onPageUp).not.toHaveBeenCalled();
    });

    it('does not call onPageDown when plain d is pressed (requires Ctrl+D)', async () => {
      const onPageDown = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onPageDown }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'd');

      expect(onPageDown).not.toHaveBeenCalled();
    });

    it('does not call onOpenFilter when plain f is pressed (requires Ctrl+F)', async () => {
      const onOpenFilter = vi.fn();
      const { stdin } = render(<TestComponent handlers={{ onOpenFilter }} />);
      await waitForInk(stdin);

      await writeKey(stdin, 'f');

      expect(onOpenFilter).not.toHaveBeenCalled();
    });
  });

  describe('cleanup and unmount', () => {
    it('stops emitting after unmount', async () => {
      const { spy, unsubscribe } = listen('nav:move');
      const { stdin, unmount } = render(<TestComponent handlers={{}} />);
      await waitForInk(stdin);

      unmount();
      await writeKey(stdin, '\\x1B[A');

      expect(spy).not.toHaveBeenCalled();
      unsubscribe();
    });
  });
});
