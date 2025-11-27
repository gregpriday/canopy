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
async function waitForInk(stdin: NodeJS.ReadableStream) {
  // Wait until Ink has attached the 'readable' listener
  let attempts = 0;
  while (stdin.listenerCount('readable') === 0 && attempts < 50) {
    await new Promise(resolve => setTimeout(resolve, 10));
    attempts++;
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
  // Note: Navigation event tests (nav:move, nav:primary) removed with tree view mode
  // Dashboard uses useDashboardNav for its own navigation

  describe('file/folder actions', () => {
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

    // Note: app.quit is mapped to 'escape' in keyPresets
    // The escape key handling is tested via the onClearFilter test above
    // onQuit is typically triggered when no other escape handlers are defined
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

    it('calls onOpenCopyTreeBuilder when Shift+C is pressed', async () => {
      const onOpenCopyTreeBuilder = vi.fn();
      const { stdin } = render(
        <TestComponent handlers={{ onOpenCopyTreeBuilder }} />
      );
      await waitForInk(stdin);

      await writeKey(stdin, 'C');

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

  // Note: Modifier key and cleanup tests for navigation events removed with tree view mode
});
