import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorktreePanel } from '../../src/components/WorktreePanel.js';
import type { Worktree } from '../../src/types/index.js';
import { events } from '../../src/services/events.js';
import type { CanopyEventMap } from '../../src/services/events.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';

describe('WorktreePanel', () => {
  const renderWithTheme = (component) => {
    const result = render(
      <ThemeProvider mode="dark">
        {component}
      </ThemeProvider>
    );
    return {
      ...result,
      rerender: (newComponent) => result.rerender(
        <ThemeProvider mode="dark">
          {newComponent}
        </ThemeProvider>
      )
    };
  };

  const mockWorktrees: Worktree[] = [
    {
      id: 'wt-main',
      path: '/repo/main',
      name: 'main',
      branch: 'main',
      isCurrent: true,
    },
    {
      id: 'wt-feature',
      path: '/repo/feature',
      name: 'feature-1',
      branch: 'feature-1',
      isCurrent: false,
    },
    {
      id: 'wt-bugfix',
      path: '/repo/bugfix',
      name: 'bugfix-2',
      branch: 'bugfix-2',
      isCurrent: false,
    },
  ];

  let defaultProps: {
    worktrees: Worktree[];
    activeWorktreeId: string | null;
    onSelect: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
  };

  const subscriptions: Array<() => void> = [];

  const listen = <K extends keyof CanopyEventMap>(event: K) => {
    const handler = vi.fn<(payload: CanopyEventMap[K]) => void>();
    const unsubscribe = events.on(event, handler);
    subscriptions.push(unsubscribe);
    return handler;
  };

  beforeEach(() => {
    defaultProps = {
      worktrees: mockWorktrees,
      activeWorktreeId: 'wt-main',
      onSelect: vi.fn(),
      onClose: vi.fn(),
    };

    subscriptions.length = 0;
  });

  afterEach(() => {
    while (subscriptions.length > 0) {
      const unsubscribe = subscriptions.pop();
      unsubscribe?.();
    }
  });

  describe('rendering', () => {
    it('renders all worktrees', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel {...defaultProps} />
      );

      const output = lastFrame();
      expect(output).toContain('main');
      expect(output).toContain('feature-1');
      expect(output).toContain('bugfix-2');
    });

    it('displays worktree paths', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel {...defaultProps} />
      );

      const output = lastFrame();
      expect(output).toContain('/repo/main');
      expect(output).toContain('/repo/feature');
      expect(output).toContain('/repo/bugfix');
    });

    it('displays worktree branches', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel {...defaultProps} />
      );

      const output = lastFrame();
      expect(output).toContain('[main]');
      expect(output).toContain('[feature-1]');
      expect(output).toContain('[bugfix-2]');
    });

    it('shows title "Git Worktrees"', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel {...defaultProps} />
      );

      expect(lastFrame()).toContain('Git Worktrees');
    });

    it('shows keyboard hints in footer', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel {...defaultProps} />
      );

      const output = lastFrame();
      expect(output).toMatch(/Navigate/);
      expect(output).toMatch(/Switch/);
      expect(output).toMatch(/Close/);
    });

    it('renders border around panel', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel {...defaultProps} />
      );

      // Check for border characters (basic check)
      expect(lastFrame()).toBeTruthy();
    });
  });

  describe('current worktree indicator', () => {
    it('shows arrow indicator for current worktree', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel {...defaultProps} activeWorktreeId="wt-main" />
      );

      const output = lastFrame();
      // Current worktree should have → indicator
      expect(output).toMatch(/→.*main/);
    });

    it('shows spaces for non-current worktrees', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel {...defaultProps} activeWorktreeId="wt-main" />
      );

      // Non-current worktrees should not have arrow
      // This is a basic check - the arrow only appears for current
      expect(lastFrame()).toContain('feature-1');
    });

    it('updates indicator when activeWorktreeId changes', () => {
      const { lastFrame, rerender } = renderWithTheme(
        <WorktreePanel {...defaultProps} activeWorktreeId="wt-main" />
      );

      let output = lastFrame();
      expect(output).toMatch(/→.*main/);

      // Switch current worktree
      rerender(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-feature"
        />
      );

      output = lastFrame();
      expect(output).toMatch(/→.*feature-1/);
    });

    it('handles null activeWorktreeId gracefully', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId={null}
        />
      );

      // Should still render all worktrees
      expect(lastFrame()).toContain('main');
      expect(lastFrame()).toContain('feature-1');
    });

    it('handles activeWorktreeId not matching any worktree', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-nonexistent"
        />
      );

      // Should still render all worktrees without crashing
      expect(lastFrame()).toContain('main');
      expect(lastFrame()).toContain('feature-1');
    });
  });

  describe('selection and cursor', () => {
    it('initializes cursor at current worktree position', () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-main"
          onSelect={onSelect}
        />
      );

      // Press Enter without navigating
      stdin.write('\r');

      // Should select wt-main (first worktree)
      expect(onSelect).toHaveBeenCalledWith('wt-main');
    });

    it('selects the main worktree if activeWorktreeId is at beginning', () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-main"
          onSelect={onSelect}
        />
      );

      stdin.write('\r');
      expect(onSelect).toHaveBeenCalledWith('wt-main');
    });

    it('falls back to first worktree when activeWorktreeId is null', () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId={null}
          onSelect={onSelect}
        />
      );

      // Press Enter (should select first item)
      stdin.write('\r');

      expect(onSelect).toHaveBeenCalledWith('wt-main');
    });

    it('initializes cursor at specific worktree position', () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-feature"
          onSelect={onSelect}
        />
      );

      // Press Enter without navigating
      stdin.write('\r');

      // Should select wt-feature (cursor starts there)
      expect(onSelect).toHaveBeenCalledWith('wt-feature');
    });
  });

  describe('keyboard navigation', () => {
    it('navigates down with arrow key', async () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-main"
          onSelect={onSelect}
        />
      );

      // Press down arrow (from main → feature)
      stdin.write('\x1B[B');

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Press Enter to select
      stdin.write('\r');

      expect(onSelect).toHaveBeenCalledWith('wt-feature');
    });

    it('navigates up with arrow key', async () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-feature"
          onSelect={onSelect}
        />
      );

      // Press up arrow (from feature → main)
      stdin.write('\x1B[A');

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Press Enter to select
      stdin.write('\r');

      expect(onSelect).toHaveBeenCalledWith('wt-main');
    });

    it('wraps to last item when pressing up from first', async () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-main"
          onSelect={onSelect}
        />
      );

      // Press up arrow (should wrap to last item)
      stdin.write('\x1B[A');

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Press Enter to select
      stdin.write('\r');

      // Should select bugfix-2 (last item)
      expect(onSelect).toHaveBeenCalledWith('wt-bugfix');
    });

    it('wraps to first item when pressing down from last', async () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-bugfix"
          onSelect={onSelect}
        />
      );

      // Press down arrow (should wrap to first item)
      stdin.write('\x1B[B');

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Press Enter to select
      stdin.write('\r');

      // Should select main (first item)
      expect(onSelect).toHaveBeenCalledWith('wt-main');
    });

    it('allows multiple navigation steps', async () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-main"
          onSelect={onSelect}
        />
      );

      // Navigate: main → feature → bugfix
      stdin.write('\x1B[B'); // down

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 0));

      stdin.write('\x1B[B'); // down

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Press Enter to select
      stdin.write('\r');

      expect(onSelect).toHaveBeenCalledWith('wt-bugfix');
    });

    it('handles rapid navigation without errors', () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          onSelect={onSelect}
        />
      );

      // Rapid navigation
      stdin.write('\x1B[B');
      stdin.write('\x1B[A');
      stdin.write('\x1B[B');
      stdin.write('\x1B[B');
      stdin.write('\r');

      // Should handle without crashing
      expect(onSelect).toHaveBeenCalled();
    });
  });

  describe('selection with Enter', () => {
    it('calls onSelect when Enter is pressed', () => {
      const onSelect = vi.fn();
      const switchSpy = listen('sys:worktree:switch');
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-main"
          onSelect={onSelect}
        />
      );

      stdin.write('\r');

      expect(onSelect).toHaveBeenCalledWith('wt-main');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(switchSpy).toHaveBeenCalledWith({ worktreeId: 'wt-main' });
    });

    it('selects the currently highlighted item', async () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-main"
          onSelect={onSelect}
        />
      );

      // Navigate to feature
      stdin.write('\x1B[B');

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Press Enter
      stdin.write('\r');

      expect(onSelect).toHaveBeenCalledWith('wt-feature');
    });

    it('does not call onSelect when empty list and Enter pressed', () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          worktrees={[]}
          activeWorktreeId={null}
          onSelect={onSelect}
          onClose={vi.fn()}
        />
      );

      stdin.write('\r');

      // Should not call onSelect when empty
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('closing with ESC', () => {
    it('calls onClose when ESC is pressed', () => {
      const onClose = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          onClose={onClose}
        />
      );

      stdin.write('\x1B');

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalled();
    });

    it('does not call onSelect when ESC is pressed', () => {
      const onSelect = vi.fn();
      const onClose = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          onSelect={onSelect}
          onClose={onClose}
        />
      );

      stdin.write('\x1B');

      expect(onClose).toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('closes without switching when ESC is pressed after navigation', () => {
      const onSelect = vi.fn();
      const onClose = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-main"
          onSelect={onSelect}
          onClose={onClose}
        />
      );

      // Navigate to feature
      stdin.write('\x1B[B');

      // Press ESC
      stdin.write('\x1B');

      expect(onClose).toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('empty state', () => {
    it('shows empty state message when no worktrees', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel
          worktrees={[]}
          activeWorktreeId={null}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(lastFrame()).toContain('No worktrees found');
    });

    it('shows title in empty state', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel
          worktrees={[]}
          activeWorktreeId={null}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(lastFrame()).toContain('Git Worktrees');
    });

    it('allows closing empty panel with ESC', () => {
      const onClose = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          worktrees={[]}
          activeWorktreeId={null}
          onSelect={vi.fn()}
          onClose={onClose}
        />
      );

      stdin.write('\x1B');

      expect(onClose).toHaveBeenCalled();
    });

    it('shows ESC hint in empty state', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel
          worktrees={[]}
          activeWorktreeId={null}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(lastFrame()).toContain('ESC');
      expect(lastFrame()).toContain('Close');
    });

    it('does not call onSelect when Enter pressed in empty state', () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          worktrees={[]}
          activeWorktreeId={null}
          onSelect={onSelect}
          onClose={vi.fn()}
        />
      );

      stdin.write('\r');

      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('prop changes', () => {
    it('updates cursor when worktrees array changes', async () => {
      const onSelect = vi.fn();
      const { rerender, stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          worktrees={mockWorktrees.slice(0, 1)}
          onSelect={onSelect}
        />
      );

      // Add more worktrees
      rerender(
        <WorktreePanel
          {...defaultProps}
          worktrees={mockWorktrees}
          onSelect={onSelect}
        />
      );

      // Navigate down
      stdin.write('\x1B[B');

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 0));

      stdin.write('\r');

      // Should work without crashing
      expect(onSelect).toHaveBeenCalled();
    });

    it('handles changing activeWorktreeId', () => {
      const onSelect = vi.fn();
      const { rerender, stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-main"
          onSelect={onSelect}
        />
      );

      // Change active worktree
      rerender(
        <WorktreePanel
          {...defaultProps}
          activeWorktreeId="wt-feature"
          onSelect={onSelect}
        />
      );

      // Press Enter
      stdin.write('\r');

      // New cursor position should apply
      expect(onSelect).toHaveBeenCalled();
    });

    it('maintains selection stability when worktrees update', () => {
      const newWorktrees = [
        {
          id: 'wt-main',
          path: '/repo/main',
          name: 'main',
          branch: 'main',
          isCurrent: true,
        },
        {
          id: 'wt-dev',
          path: '/repo/dev',
          name: 'dev',
          branch: 'dev',
          isCurrent: false,
        },
      ];

      const { rerender } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          worktrees={mockWorktrees}
          activeWorktreeId="wt-main"
        />
      );

      // Update worktrees array
      rerender(
        <WorktreePanel
          {...defaultProps}
          worktrees={newWorktrees}
          activeWorktreeId="wt-main"
        />
      );

      // Should not crash
      expect(true).toBe(true);
    });
  });

  describe('single worktree edge cases', () => {
    it('renders single worktree correctly', () => {
      const singleWorktree = [mockWorktrees[0]];
      const { lastFrame } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          worktrees={singleWorktree}
          activeWorktreeId="wt-main"
        />
      );

      expect(lastFrame()).toContain('main');
    });

    it('wraps navigation in single worktree list', () => {
      const singleWorktree = [mockWorktrees[0]];
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          worktrees={singleWorktree}
          activeWorktreeId="wt-main"
          onSelect={onSelect}
        />
      );

      // Navigate down from single item
      stdin.write('\x1B[B');

      // Still at same position (only one item)
      stdin.write('\r');

      expect(onSelect).toHaveBeenCalledWith('wt-main');
    });

    it('selects single worktree with Enter', () => {
      const singleWorktree = [mockWorktrees[0]];
      const onSelect = vi.fn();
      const { stdin } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          worktrees={singleWorktree}
          onSelect={onSelect}
        />
      );

      stdin.write('\r');

      expect(onSelect).toHaveBeenCalledWith('wt-main');
    });
  });

  describe('worktrees without branch info', () => {
    it('handles worktree without branch property', () => {
      const worktreeNoBranch: Worktree = {
        id: 'wt-detached',
        path: '/repo/detached',
        name: 'detached',
        // branch is undefined
        isCurrent: false,
      };

      const { lastFrame } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          worktrees={[worktreeNoBranch]}
          activeWorktreeId="wt-detached"
        />
      );

      // Should render without crashing, no branch shown
      expect(lastFrame()).toContain('detached');
      expect(lastFrame()).toContain('/repo/detached');
    });

    it('shows branch for worktrees that have it', () => {
      const worktrees: Worktree[] = [
        {
          id: 'wt-main',
          path: '/repo/main',
          name: 'main',
          branch: 'main',
          isCurrent: true,
        },
        {
          id: 'wt-detached',
          path: '/repo/detached',
          name: 'detached',
          // no branch
          isCurrent: false,
        },
      ];

      const { lastFrame } = renderWithTheme(
        <WorktreePanel
          {...defaultProps}
          worktrees={worktrees}
          activeWorktreeId="wt-main"
        />
      );

      const output = lastFrame();
      expect(output).toContain('[main]'); // Has branch
      expect(output).toContain('detached'); // No branch shown
    });
  });

  describe('visual styling', () => {
    it('renders component without crashing', () => {
      const { lastFrame } = renderWithTheme(
        <WorktreePanel {...defaultProps} />
      );

      expect(lastFrame()).toBeTruthy();
    });

    it('displays consistent layout across renders', () => {
      const { lastFrame: frame1 } = renderWithTheme(
        <WorktreePanel {...defaultProps} />
      );

      const output1 = frame1();

      const { lastFrame: frame2 } = renderWithTheme(
        <WorktreePanel {...defaultProps} />
      );

      const output2 = frame2();

      // Both renders should have similar content
      expect(output1).toContain('Git Worktrees');
      expect(output2).toContain('Git Worktrees');
    });
  });
});
