import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { Box } from 'ink';
import { useMouse } from '../../src/hooks/useMouse.js';
import type { TreeNode } from '../../src/types/index.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import { events } from '../../src/services/events.js';

describe('useMouse', () => {
  const mockTree: TreeNode[] = [
    { name: 'src', path: 'src', type: 'directory', depth: 0, expanded: true },
    { name: 'App.tsx', path: 'src/App.tsx', type: 'file', depth: 1 },
    { name: 'utils', path: 'src/utils', type: 'directory', depth: 1, expanded: false },
    { name: 'README.md', path: 'README.md', type: 'file', depth: 0 },
  ];

  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    emitSpy = vi.spyOn(events, 'emit');
  });

  afterEach(() => {
    emitSpy.mockRestore();
  });

  const createOptions = (overrides = {}) => ({
    fileTree: mockTree,
    selectedPath: null,
    scrollOffset: 0,
    viewportHeight: 10,
    headerHeight: 1,
    onSelect: vi.fn(),
    onToggle: vi.fn(),
    onOpen: vi.fn(),
    onContextMenu: vi.fn(),
    onScrollChange: vi.fn(),
    config: DEFAULT_CONFIG,
    ...overrides,
  });

  // Test component that uses the hook
  function TestComponent(props: any) {
    const { handleClick, handleScroll } = useMouse(props);
    // Store handlers on a ref-like object we can access
    (global as any).testHandlers = { handleClick, handleScroll };
    return React.createElement(Box, {}, 'test');
  }

  describe('handleClick', () => {
    it('toggles folder on left-click', () => {
      const onToggle = vi.fn();
      const options = createOptions({ onToggle });
      render(React.createElement(TestComponent, options));

      const { handleClick } = (global as any).testHandlers;

      // Click on first row (src folder) after 1-row header
      handleClick({
        x: 0,
        y: 1, // Header is row 0, first tree row is 1
        button: 'left',
        shift: false,
        ctrl: false,
        meta: false,
      });

      expect(onToggle).toHaveBeenCalledWith('src');
    });

    it('emits file:copy-path event on left-click', () => {
      const options = createOptions();
      render(React.createElement(TestComponent, options));

      const { handleClick } = (global as any).testHandlers;

      handleClick({
        x: 3,
        y: 2,
        button: 'left',
        shift: false,
        ctrl: false,
        meta: false,
      });

      expect(emitSpy).toHaveBeenCalledWith('file:copy-path', { path: 'src/App.tsx' });
    });

    it('does not call onOpen or onSelect on left-click (emits copy event instead)', () => {
      const onOpen = vi.fn();
      const onSelect = vi.fn();
      const options = createOptions({ onOpen, onSelect });
      render(React.createElement(TestComponent, options));

      const { handleClick } = (global as any).testHandlers;

      // Click on file
      handleClick({
        x: 3,
        y: 2,
        button: 'left',
        shift: false,
        ctrl: false,
        meta: false,
      });

      // Should emit copy event, not call onOpen or onSelect
      expect(emitSpy).toHaveBeenCalledWith('file:copy-path', { path: 'src/App.tsx' });
      expect(onOpen).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('opens context menu on right-click', () => {
      const onContextMenu = vi.fn();
      const options = createOptions({ onContextMenu });
      render(React.createElement(TestComponent, options));

      const { handleClick } = (global as any).testHandlers;

      handleClick({
        x: 10,
        y: 2,
        button: 'right',
        shift: false,
        ctrl: false,
        meta: false,
      });

      expect(onContextMenu).toHaveBeenCalledWith('src/App.tsx', { x: 10, y: 2 });
    });

    it('ignores clicks on header', () => {
      const onToggle = vi.fn();
      const onOpen = vi.fn();
      const onSelect = vi.fn();

      const options = createOptions({ onToggle, onOpen, onSelect });
      render(React.createElement(TestComponent, options));

      const { handleClick } = (global as any).testHandlers;

      // Click on row 0 (header)
      handleClick({
        x: 0,
        y: 0,
        button: 'left',
        shift: false,
        ctrl: false,
        meta: false,
      });

      expect(onToggle).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('ignores clicks beyond tree length', () => {
      const onToggle = vi.fn();
      const options = createOptions({ onToggle });
      render(React.createElement(TestComponent, options));

      const { handleClick } = (global as any).testHandlers;

      // Click on row 100 (way beyond tree)
      handleClick({
        x: 0,
        y: 100,
        button: 'left',
        shift: false,
        ctrl: false,
        meta: false,
      });

      expect(onToggle).not.toHaveBeenCalled();
    });

    it('accounts for scroll offset when mapping coordinates', () => {
      const onToggle = vi.fn();
      const options = createOptions({ onToggle, scrollOffset: 2 });
      render(React.createElement(TestComponent, options));

      const { handleClick } = (global as any).testHandlers;

      // Click on row 1 (first tree row on screen)
      // With scrollOffset=2, this is actually tree index 2 (src/utils folder)
      handleClick({
        x: 0,
        y: 1,
        button: 'left',
        shift: false,
        ctrl: false,
        meta: false,
      });

      expect(onToggle).toHaveBeenCalledWith('src/utils');
    });

    it('emits file:copy-path on middle-click', () => {
      const options = createOptions();
      render(React.createElement(TestComponent, options));

      const { handleClick } = (global as any).testHandlers;

      handleClick({
        x: 3,
        y: 2,
        button: 'middle',
        shift: false,
        ctrl: false,
        meta: false,
      });

      expect(emitSpy).toHaveBeenCalledWith('file:copy-path', { path: 'src/App.tsx' });
    });

    it('does not emit copy event when clicking outside file name bounds', () => {
      const options = createOptions();
      render(React.createElement(TestComponent, options));

      const { handleClick } = (global as any).testHandlers;

      // Click far to the right, beyond the file name
      // App.tsx is at depth 1, so indent is 2, icon is 2 chars, name is 7 chars = endX is 11
      // Clicking at x=20 should not trigger copy
      handleClick({
        x: 20,
        y: 2,
        button: 'left',
        shift: false,
        ctrl: false,
        meta: false,
      });

      expect(emitSpy).not.toHaveBeenCalledWith('file:copy-path', expect.anything());
    });
  });

  describe('handleScroll', () => {
    it('scrolls down on positive deltaY', () => {
      const onScrollChange = vi.fn();
      // Use a smaller viewport so scrolling is possible (4 items - 2 viewport = 2 max scroll)
      const options = createOptions({ onScrollChange, scrollOffset: 0, viewportHeight: 2 });
      render(React.createElement(TestComponent, options));

      const { handleScroll } = (global as any).testHandlers;

      handleScroll({
        x: 0,
        y: 5,
        deltaY: 1, // One notch down
      });

      // Should scroll down by 3 lines, but clamped to maxScroll = 2
      expect(onScrollChange).toHaveBeenCalledWith(2);
    });

    it('scrolls up on negative deltaY', () => {
      const onScrollChange = vi.fn();
      // Use smaller viewport and start at max scroll (2)
      const options = createOptions({ onScrollChange, scrollOffset: 2, viewportHeight: 2 });
      render(React.createElement(TestComponent, options));

      const { handleScroll } = (global as any).testHandlers;

      handleScroll({
        x: 0,
        y: 5,
        deltaY: -1, // One notch up
      });

      // Should scroll up by 3 lines, but clamped to 0 (2 - 3 = -1 → clamped to 0)
      expect(onScrollChange).toHaveBeenCalledWith(0);
    });

    it('clamps scroll to 0 minimum', () => {
      const onScrollChange = vi.fn();
      const options = createOptions({ onScrollChange, scrollOffset: 1, viewportHeight: 2 });
      render(React.createElement(TestComponent, options));

      const { handleScroll } = (global as any).testHandlers;

      handleScroll({
        x: 0,
        y: 5,
        deltaY: -5, // Large negative delta
      });

      // Should clamp to 0
      expect(onScrollChange).toHaveBeenCalledWith(0);
    });

    it('clamps scroll to max scroll', () => {
      const onScrollChange = vi.fn();
      const options = createOptions({
        onScrollChange,
        scrollOffset: 0,
        viewportHeight: 2,
        // fileTree has 4 items, viewport is 2, so maxScroll = 2
      });
      render(React.createElement(TestComponent, options));

      const { handleScroll } = (global as any).testHandlers;

      handleScroll({
        x: 0,
        y: 5,
        deltaY: 10, // Large positive delta
      });

      // Should clamp to maxScroll = 4 - 2 = 2
      expect(onScrollChange).toHaveBeenCalledWith(2);
    });

    it('does not call onScrollChange if offset unchanged', () => {
      const onScrollChange = vi.fn();
      const options = createOptions({
        onScrollChange,
        scrollOffset: 0,
        viewportHeight: 10,
      });
      render(React.createElement(TestComponent, options));

      const { handleScroll } = (global as any).testHandlers;

      // Try to scroll up when already at top
      handleScroll({
        x: 0,
        y: 5,
        deltaY: -1,
      });

      // Should not call because clamping results in same offset
      expect(onScrollChange).not.toHaveBeenCalled();
    });
  });
});
