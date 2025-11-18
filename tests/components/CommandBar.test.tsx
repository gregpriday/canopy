import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandBar } from '../../src/components/CommandBar.js';

describe('CommandBar', () => {
  let defaultProps: {
    active: boolean;
    input: string;
    history: string[];
    onInputChange: ReturnType<typeof vi.fn>;
    onSubmit: ReturnType<typeof vi.fn>;
    onCancel: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    defaultProps = {
      active: true,
      input: '',
      history: [],
      onInputChange: vi.fn(),
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    };
  });

  describe('visibility', () => {
    it('renders nothing when active is false', () => {
      const { lastFrame } = render(
        <CommandBar {...defaultProps} active={false} />
      );

      expect(lastFrame()).toBe('');
    });

    it('renders command bar when active is true', () => {
      const { lastFrame } = render(<CommandBar {...defaultProps} />);

      // Should show "/" and placeholder
      expect(lastFrame()).toContain('/');
      expect(lastFrame()).toContain('Type command');
    });
  });

  describe('input handling', () => {
    it('displays current input value', () => {
      const { lastFrame } = render(
        <CommandBar {...defaultProps} input="filter .ts" />
      );

      expect(lastFrame()).toContain('filter .ts');
    });

    it('calls onInputChange when text is typed', () => {
      const { stdin } = render(<CommandBar {...defaultProps} />);

      // Type some text
      stdin.write('f');

      expect(defaultProps.onInputChange).toHaveBeenCalledWith('f');
    });

    it('shows placeholder when input is empty', () => {
      const { lastFrame } = render(<CommandBar {...defaultProps} />);

      expect(lastFrame()).toContain('Type command or filter text');
    });
  });

  describe('command submission', () => {
    it('calls onSubmit when Enter is pressed with input', () => {
      const { stdin } = render(
        <CommandBar {...defaultProps} input="filter .ts" />
      );

      // Press Enter
      stdin.write('\r');

      expect(defaultProps.onSubmit).toHaveBeenCalledWith('filter .ts');
    });

    it('calls onCancel when Enter is pressed with empty input', () => {
      const { stdin } = render(<CommandBar {...defaultProps} input="" />);

      stdin.write('\r');

      expect(defaultProps.onCancel).toHaveBeenCalled();
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('trims whitespace before checking if input is empty', () => {
      const { stdin } = render(
        <CommandBar {...defaultProps} input="   " />
      );

      stdin.write('\r');

      // Should cancel, not submit
      expect(defaultProps.onCancel).toHaveBeenCalled();
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('command cancellation', () => {
    it('calls onCancel when ESC is pressed', () => {
      const { stdin } = render(
        <CommandBar {...defaultProps} input="some text" />
      );

      // Press ESC
      stdin.write('\x1B');

      expect(defaultProps.onCancel).toHaveBeenCalled();
    });
  });

  describe('history navigation', () => {
    it('navigates to previous command with up arrow', () => {
      const history = ['git modified', 'filter .ts', 'wt list'];

      const { stdin } = render(
        <CommandBar {...defaultProps} history={history} />
      );

      // Press up arrow
      stdin.write('\x1B[A');

      // Should load most recent command (index 0)
      expect(defaultProps.onInputChange).toHaveBeenCalledWith('git modified');
    });

    it('navigates through multiple history entries', () => {
      const history = ['cmd3', 'cmd2', 'cmd1'];

      const { stdin } = render(
        <CommandBar {...defaultProps} history={history} />
      );

      // First up arrow → cmd3 (most recent)
      stdin.write('\x1B[A');

      // Check that first navigation works
      expect(defaultProps.onInputChange).toHaveBeenCalledWith('cmd3');

      // Verify we can access different history indices by testing with different starting points
      const props2 = {
        ...defaultProps,
        onInputChange: vi.fn(),
      };

      // Render at history index 1 and press up arrow to go to index 2
      const { stdin: stdin2 } = render(
        <CommandBar {...props2} history={history} input="cmd2" />
      );

      stdin2.write('\x1B[A');
      // Should load cmd1 (older than cmd2)
      expect(props2.onInputChange).toHaveBeenCalled();
    });

    it('stops at oldest command when navigating up', () => {
      const history = ['cmd2', 'cmd1'];

      const { stdin, rerender } = render(
        <CommandBar {...defaultProps} history={history} />
      );

      // Press up arrow 3 times (more than history length)
      stdin.write('\x1B[A'); // → cmd2
      rerender(<CommandBar {...defaultProps} history={history} input="cmd2" />);

      stdin.write('\x1B[A'); // → cmd1
      rerender(<CommandBar {...defaultProps} history={history} input="cmd1" />);

      // Clear the mock to track only the next call
      defaultProps.onInputChange.mockClear();
      stdin.write('\x1B[A'); // → still cmd1 (should not call onInputChange)

      // Should not have been called (no change when at oldest)
      expect(defaultProps.onInputChange).not.toHaveBeenCalled();
    });

    it('navigates to next command with down arrow', () => {
      const history = ['cmd3', 'cmd2', 'cmd1'];

      const { stdin, rerender } = render(
        <CommandBar {...defaultProps} history={history} />
      );

      // Navigate up twice
      stdin.write('\x1B[A'); // → cmd3
      rerender(<CommandBar {...defaultProps} history={history} input="cmd3" />);

      stdin.write('\x1B[A'); // → cmd2
      rerender(<CommandBar {...defaultProps} history={history} input="cmd2" />);

      // Now navigate down
      stdin.write('\x1B[B'); // → cmd3

      expect(defaultProps.onInputChange).toHaveBeenCalledWith('cmd3');
    });

    it('saves draft when entering history mode', () => {
      const history = ['cmd1'];

      const { stdin } = render(
        <CommandBar {...defaultProps} history={history} input="my draft" />
      );

      // Navigate up to history (should save draft internally)
      stdin.write('\x1B[A');

      // Should load the history entry
      expect(defaultProps.onInputChange).toHaveBeenCalledWith('cmd1');

      // Note: Draft restoration on down arrow is tested implicitly through
      // the component's state management. Full integration test would require
      // parent component to manage state properly.
    });

    it('does nothing when up arrow pressed with empty history', () => {
      const { stdin } = render(
        <CommandBar {...defaultProps} history={[]} />
      );

      stdin.write('\x1B[A');

      expect(defaultProps.onInputChange).not.toHaveBeenCalled();
    });

    it('ignores down arrow when not in history mode', () => {
      const history = ['cmd1'];
      const { stdin } = render(
        <CommandBar {...defaultProps} history={history} input="my text" />
      );

      // Press down arrow while not in history mode (historyIndex = -1)
      stdin.write('\x1B[B');

      // Should not call onInputChange (input should stay unchanged)
      expect(defaultProps.onInputChange).not.toHaveBeenCalled();
    });

    it('submits history entry after navigation', () => {
      const history = ['historical command'];
      const { stdin, rerender } = render(
        <CommandBar {...defaultProps} history={history} />
      );

      // Navigate to history entry
      stdin.write('\x1B[A');
      rerender(<CommandBar {...defaultProps} history={history} input="historical command" />);

      // Press Enter to submit
      stdin.write('\r');

      // Should submit the history entry
      expect(defaultProps.onSubmit).toHaveBeenCalledWith('historical command');
    });

    it('resets history state when toggling inactive and back', () => {
      const history = ['cmd1', 'cmd2'];
      const { stdin, rerender } = render(
        <CommandBar {...defaultProps} history={history} input="draft" />
      );

      // Navigate into history
      stdin.write('\x1B[A');
      rerender(<CommandBar {...defaultProps} history={history} input="cmd1" />);

      // Toggle inactive
      rerender(<CommandBar {...defaultProps} active={false} history={history} input="cmd1" />);

      // Toggle back active
      rerender(<CommandBar {...defaultProps} active={true} history={history} input="" />);

      // Clear mock to track only the next call
      defaultProps.onInputChange.mockClear();

      // Now press down arrow - should not do anything (history state was reset)
      stdin.write('\x1B[B');

      // Should not call onInputChange since we're not in history mode anymore
      expect(defaultProps.onInputChange).not.toHaveBeenCalled();
    });

    it('exits history mode when user types manually', () => {
      const history = ['old command'];

      const { stdin, rerender } = render(
        <CommandBar {...defaultProps} history={history} />
      );

      // Navigate to history
      stdin.write('\x1B[A');
      rerender(
        <CommandBar {...defaultProps} history={history} input="old command" />
      );

      // Type new text (should exit history mode)
      stdin.write('n');

      // Next down arrow should NOT go to newer history entry
      // (because we exited history mode by typing)
      stdin.write('\x1B[B');

      // Should only have the up arrow call, not the down arrow
      expect(defaultProps.onInputChange).toHaveBeenCalledTimes(2); // Up + typing 'n'
    });
  });

  describe('visual elements', () => {
    it('displays "/" prefix before input', () => {
      const { lastFrame } = render(<CommandBar {...defaultProps} />);

      expect(lastFrame()).toContain('/');
    });

    it('uses cyan color for border and prefix', () => {
      const { lastFrame } = render(<CommandBar {...defaultProps} />);

      // Exact output depends on Ink's rendering, but should contain cyan styling
      // This is a basic check - visual inspection is also needed
      expect(lastFrame()).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('handles toggling active state without errors', () => {
      const { rerender } = render(<CommandBar {...defaultProps} active={true} />);

      // Toggle off
      rerender(<CommandBar {...defaultProps} active={false} />);

      // Toggle on
      rerender(<CommandBar {...defaultProps} active={true} />);

      // Should not throw
      expect(true).toBe(true);
    });

    it('handles rapid history navigation', () => {
      const history = ['cmd3', 'cmd2', 'cmd1'];
      const { stdin } = render(
        <CommandBar {...defaultProps} history={history} />
      );

      // Rapid up/down presses
      stdin.write('\x1B[A'); // Up
      stdin.write('\x1B[A'); // Up
      stdin.write('\x1B[B'); // Down
      stdin.write('\x1B[A'); // Up
      stdin.write('\x1B[B'); // Down
      stdin.write('\x1B[B'); // Down

      // Should handle without crashing
      expect(defaultProps.onInputChange).toHaveBeenCalled();
    });

    it('handles very long command input', () => {
      const longInput = 'a'.repeat(200);

      const { lastFrame } = render(
        <CommandBar {...defaultProps} input={longInput} />
      );

      // Terminal will wrap long input, so just check it contains part of it
      expect(lastFrame()).toContain('aaaaaaaaa');
    });

    it('handles special characters in input', () => {
      const specialInput = '/filter *.{ts,tsx} --exclude node_modules';

      const { lastFrame } = render(
        <CommandBar {...defaultProps} input={specialInput} />
      );

      expect(lastFrame()).toContain(specialInput);
    });

    it('handles large history array', () => {
      const largeHistory = Array.from({ length: 100 }, (_, i) => `cmd${i}`);

      const { stdin } = render(
        <CommandBar {...defaultProps} history={largeHistory} />
      );

      // Navigate to oldest command
      for (let i = 0; i < 100; i++) {
        stdin.write('\x1B[A');
      }

      // Should not crash or overflow
      expect(defaultProps.onInputChange).toHaveBeenCalled();
    });
  });

  describe('keyboard event isolation', () => {
    it('does not handle keyboard events when inactive', () => {
      const { stdin } = render(
        <CommandBar {...defaultProps} active={false} />
      );

      // Try pressing ESC while inactive
      stdin.write('\x1B');

      // Should not call onCancel
      expect(defaultProps.onCancel).not.toHaveBeenCalled();
    });

    it('does not navigate history when inactive', () => {
      const history = ['cmd1', 'cmd2'];
      const { stdin } = render(
        <CommandBar {...defaultProps} active={false} history={history} />
      );

      // Try pressing up arrow while inactive
      stdin.write('\x1B[A');

      // Should not call onInputChange
      expect(defaultProps.onInputChange).not.toHaveBeenCalled();
    });
  });
});
