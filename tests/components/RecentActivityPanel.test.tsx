import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecentActivityPanel } from '../../src/components/RecentActivityPanel.js';
import type { ActivityEvent } from '../../src/types/index.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';

describe('RecentActivityPanel', () => {
  const renderWithTheme = (component: React.ReactElement) => {
    const result = render(<ThemeProvider mode="dark">{component}</ThemeProvider>);
    return {
      ...result,
      rerender: (newComponent: React.ReactElement) =>
        result.rerender(<ThemeProvider mode="dark">{newComponent}</ThemeProvider>),
    };
  };

  const mockEvents: ActivityEvent[] = [
    {
      path: 'src/components/TreeView.tsx',
      type: 'change',
      timestamp: Date.now() - 4000, // 4s ago
    },
    {
      path: 'src/types/index.ts',
      type: 'add',
      timestamp: Date.now() - 15000, // 15s ago
    },
    {
      path: 'README.md',
      type: 'unlink',
      timestamp: Date.now() - 60000, // 1m ago
    },
  ];

  let defaultProps: {
    visible: boolean;
    events: ActivityEvent[];
    onClose: ReturnType<typeof vi.fn>;
    onSelectPath: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    defaultProps = {
      visible: true,
      events: mockEvents,
      onClose: vi.fn(),
      onSelectPath: vi.fn(),
    };
  });

  describe('rendering', () => {
    it('renders when visible', () => {
      const { lastFrame } = renderWithTheme(<RecentActivityPanel {...defaultProps} />);

      const output = lastFrame();
      expect(output).toContain('Recent Activity');
    });

    it('returns null when not visible', () => {
      const { lastFrame } = renderWithTheme(
        <RecentActivityPanel {...defaultProps} visible={false} />,
      );

      const output = lastFrame();
      expect(output).toBe('');
    });

    it('displays events with correct icons and paths', () => {
      const { lastFrame } = renderWithTheme(<RecentActivityPanel {...defaultProps} />);

      const output = lastFrame();
      // Check for event type icons
      expect(output).toMatch(/[~]/); // change icon
      expect(output).toMatch(/[+]/); // add icon
      expect(output).toMatch(/D/); // delete icon

      // Check for file paths
      expect(output).toContain('TreeView.tsx');
      expect(output).toContain('index.ts');
      expect(output).toContain('README.md');
    });

    it('displays relative timestamps', () => {
      const { lastFrame } = renderWithTheme(<RecentActivityPanel {...defaultProps} />);

      const output = lastFrame();
      // Timestamps should be displayed (exact format may vary)
      expect(output).toMatch(/\ds ago/); // seconds
      expect(output).toMatch(/\dm ago/); // minutes
    });

    it('shows keyboard hints in footer', () => {
      const { lastFrame } = renderWithTheme(<RecentActivityPanel {...defaultProps} />);

      const output = lastFrame();
      expect(output).toContain('Navigate');
      expect(output).toContain('Jump');
      expect(output).toContain('Close');
    });
  });

  describe('empty state', () => {
    it('shows empty state when no events', () => {
      const { lastFrame } = renderWithTheme(<RecentActivityPanel {...defaultProps} events={[]} />);

      const output = lastFrame();
      expect(output).toContain('No recent activity');
    });

    it('shows close hint in empty state', () => {
      const { lastFrame } = renderWithTheme(<RecentActivityPanel {...defaultProps} events={[]} />);

      const output = lastFrame();
      expect(output).toContain('ESC/q: Close');
    });

    it('does not call onSelectPath when empty', () => {
      const { stdin } = renderWithTheme(<RecentActivityPanel {...defaultProps} events={[]} />);

      // Try to press Enter
      stdin.write('\r');

      expect(defaultProps.onSelectPath).not.toHaveBeenCalled();
    });
  });

  describe('keyboard navigation', () => {
    it('calls onClose when ESC pressed', async () => {
      const { stdin } = renderWithTheme(<RecentActivityPanel {...defaultProps} />);

      stdin.write('\x1b'); // ESC key

      // Wait for React to process the input
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when q pressed', async () => {
      const { stdin } = renderWithTheme(<RecentActivityPanel {...defaultProps} />);

      stdin.write('q');

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onSelectPath when Enter pressed', async () => {
      const { stdin } = renderWithTheme(<RecentActivityPanel {...defaultProps} />);

      stdin.write('\r'); // Enter key

      await new Promise(resolve => setTimeout(resolve, 0));

      // Should select the first event (cursor starts at 0)
      expect(defaultProps.onSelectPath).toHaveBeenCalledWith('src/components/TreeView.tsx');
    });

    it('navigates down with arrow key', async () => {
      const { stdin } = renderWithTheme(<RecentActivityPanel {...defaultProps} />);

      // Press down arrow
      stdin.write('\x1b[B');
      await new Promise(resolve => setTimeout(resolve, 0));

      // Press Enter to select
      stdin.write('\r');
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should select the second event
      expect(defaultProps.onSelectPath).toHaveBeenCalledWith('src/types/index.ts');
    });

    it('navigates up with arrow key', async () => {
      const { stdin } = renderWithTheme(<RecentActivityPanel {...defaultProps} />);

      // Press up arrow (should wrap to last event)
      stdin.write('\x1b[A');
      await new Promise(resolve => setTimeout(resolve, 0));

      // Press Enter to select
      stdin.write('\r');
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should select the last event (wrap-around)
      expect(defaultProps.onSelectPath).toHaveBeenCalledWith('README.md');
    });

    it('wraps around when navigating past end', async () => {
      const { stdin } = renderWithTheme(<RecentActivityPanel {...defaultProps} />);

      // Press down arrow multiple times to go past the end
      stdin.write('\x1b[B'); // Move to index 1
      await new Promise(resolve => setTimeout(resolve, 0));
      stdin.write('\x1b[B'); // Move to index 2
      await new Promise(resolve => setTimeout(resolve, 0));
      stdin.write('\x1b[B'); // Should wrap to index 0
      await new Promise(resolve => setTimeout(resolve, 0));

      // Press Enter to select
      stdin.write('\r');
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should select the first event (wrapped around)
      expect(defaultProps.onSelectPath).toHaveBeenCalledWith('src/components/TreeView.tsx');
    });
  });

  describe('path truncation', () => {
    it('truncates long paths', () => {
      const longPathEvent: ActivityEvent = {
        path: 'src/components/very/deeply/nested/directory/structure/SomeLongComponentName.tsx',
        type: 'change',
        timestamp: Date.now() - 5000,
      };

      const { lastFrame } = renderWithTheme(
        <RecentActivityPanel {...defaultProps} events={[longPathEvent]} />,
      );

      const output = lastFrame();
      // Path should be truncated but still show filename
      expect(output).toContain('SomeLongComponentName.tsx');
      expect(output).toContain('...');
    });

    it('preserves first directory when Windows separators are used', () => {
      const windowsPathEvent: ActivityEvent = {
        path: 'src\\components\\very\\deeply\\nested\\structure\\SomeLongComponentName.tsx',
        type: 'change',
        timestamp: Date.now() - 5000,
      };

      const { lastFrame } = renderWithTheme(
        <RecentActivityPanel {...defaultProps} events={[windowsPathEvent]} />,
      );

      const output = lastFrame();
      // Should still show the first directory followed by ellipsis
      expect(output).toContain('src/.../SomeLongComponentName.tsx');
    });
  });

  describe('cursor clamping', () => {
    it('clamps cursor when events list shrinks', async () => {
      const { rerender, stdin } = renderWithTheme(<RecentActivityPanel {...defaultProps} />);

      // Navigate to last event
      stdin.write('\x1b[B'); // index 1
      await new Promise(resolve => setTimeout(resolve, 0));
      stdin.write('\x1b[B'); // index 2
      await new Promise(resolve => setTimeout(resolve, 0));

      // Update events to a smaller list
      rerender(
        <RecentActivityPanel
          {...defaultProps}
          events={[mockEvents[0]]} // Only one event
        />,
      );
      await new Promise(resolve => setTimeout(resolve, 0));

      // Press Enter - should select the only available event
      stdin.write('\r');
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(defaultProps.onSelectPath).toHaveBeenCalledWith('src/components/TreeView.tsx');
    });
  });
});
