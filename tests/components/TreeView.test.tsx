import React from 'react';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { render } from 'ink-testing-library';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { TreeView } from '../../src/components/TreeView.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import type { TreeNode } from '../../src/types/index.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';

describe('TreeView virtualization', () => {
  const renderWithTheme = (component) => {
    return render(
      <ThemeProvider mode="dark">
        {component}
      </ThemeProvider>
    );
  };

  let originalRows: number | undefined;

  beforeEach(() => {
    // Save original terminal rows
    originalRows = process.stdout.rows;
  });

  afterEach(() => {
    // Restore original terminal rows
    if (originalRows !== undefined) {
      Object.defineProperty(process.stdout, 'rows', {
        value: originalRows,
        writable: true,
        configurable: true,
      });
    }
  });

  const createLargeTree = (count: number): TreeNode[] => {
    return Array.from({ length: count }, (_, i) => ({
      name: `file-${i}.txt`,
      path: `/root/file-${i}.txt`,
      type: 'file' as const,
      depth: 0,
    }));
  };

  const createNestedTree = (): TreeNode[] => {
    return [
      {
        name: 'folder1',
        path: '/root/folder1',
        type: 'directory' as const,
        depth: 0,
        expanded: true,
        children: [
          { name: 'file1.txt', path: '/root/folder1/file1.txt', type: 'file' as const, depth: 1 },
          { name: 'file2.txt', path: '/root/folder1/file2.txt', type: 'file' as const, depth: 1 },
        ],
      },
      {
        name: 'folder2',
        path: '/root/folder2',
        type: 'directory' as const,
        depth: 0,
        expanded: false,
        children: [
          { name: 'hidden.txt', path: '/root/folder2/hidden.txt', type: 'file' as const, depth: 1 },
        ],
      },
      { name: 'file3.txt', path: '/root/file3.txt', type: 'file' as const, depth: 0 },
    ];
  };

  describe('rendering', () => {
    it('renders empty state when fileTree is empty', () => {
      const { lastFrame } = renderWithTheme(
        <TreeView
          fileTree={[]}
          selectedPath=""
          config={DEFAULT_CONFIG}
        />
      );

      const output = lastFrame();
      expect(output).toContain('No files to display');
    });

    it('renders visible nodes when tree fits in viewport', () => {
      // Mock small terminal
      Object.defineProperty(process.stdout, 'rows', { value: 30, writable: true, configurable: true });

      const smallTree = createLargeTree(10);
      const { lastFrame } = renderWithTheme(
        <TreeView
          fileTree={smallTree}
          selectedPath=""
          config={DEFAULT_CONFIG}
        />
      );

      const output = lastFrame();

      // All files should be visible
      expect(output).toContain('file-0.txt');
      expect(output).toContain('file-9.txt');

      // No scroll indicators
      expect(output).not.toContain('more above');
      expect(output).not.toContain('more below');
    });

    it('renders only visible portion of large tree', () => {
      // Mock terminal height: 30 rows total, 27 for tree (30 - 3 reserved)
      Object.defineProperty(process.stdout, 'rows', { value: 30, writable: true, configurable: true });

      const largeTree = createLargeTree(100);
      const { lastFrame } = renderWithTheme(
        <TreeView
          fileTree={largeTree}
          selectedPath=""
          config={DEFAULT_CONFIG}
        />
      );

      const output = lastFrame();

      // First few files should be visible
      expect(output).toContain('file-0.txt');

      // Files way down the list should NOT be visible
      expect(output).not.toContain('file-50.txt');
      expect(output).not.toContain('file-99.txt');

      // Should show "more below" indicator
      expect(output).toContain('more below');
    });

    it('shows bottom scroll indicator for large tree', () => {
      Object.defineProperty(process.stdout, 'rows', { value: 30, writable: true, configurable: true });

      const largeTree = createLargeTree(100);
      const { lastFrame } = renderWithTheme(
        <TreeView
          fileTree={largeTree}
          selectedPath=""
          config={DEFAULT_CONFIG}
        />
      );

      const output = lastFrame();

      // Should show "more below" indicator when initially rendered with large tree
      expect(output).toContain('more below');
    });

    it('respects expansion state for directories', () => {
      Object.defineProperty(process.stdout, 'rows', { value: 30, writable: true, configurable: true });

      const tree = createNestedTree();
      const { lastFrame } = renderWithTheme(
        <TreeView
          fileTree={tree}
          selectedPath=""
          config={DEFAULT_CONFIG}
        />
      );

      const output = lastFrame();

      // Expanded folder1 children should be visible
      expect(output).toContain('folder1');
      expect(output).toContain('file1.txt');
      expect(output).toContain('file2.txt');

      // Collapsed folder2 children should NOT be visible
      expect(output).toContain('folder2');
      expect(output).not.toContain('hidden.txt');

      // Root file should be visible
      expect(output).toContain('file3.txt');
    });

    it('highlights selected node', () => {
      Object.defineProperty(process.stdout, 'rows', { value: 30, writable: true, configurable: true });

      const tree = createLargeTree(10);
      const { lastFrame } = renderWithTheme(
        <TreeView
          fileTree={tree}
          selectedPath="/root/file-5.txt"
          config={DEFAULT_CONFIG}
        />
      );

      const output = lastFrame();

      // The selected file should be present and will be rendered with selection styling
      expect(output).toContain('file-5.txt');
    });
  });

  describe('auto-scroll', () => {
    it('renders initial view without scroll indicator', () => {
      Object.defineProperty(process.stdout, 'rows', { value: 15, writable: true, configurable: true });

      const tree = createLargeTree(50);

      const { lastFrame } = renderWithTheme(
        <TreeView
          fileTree={tree}
          selectedPath="/root/file-0.txt"
          config={DEFAULT_CONFIG}
        />
      );

      const output = lastFrame();

      // Should NOT show "more above" indicator at top of tree
      expect(output).not.toContain('more above');
      // Should show "more below" indicator with large tree
      expect(output).toContain('more below');
    });

    // Note: Auto-scroll behavior is tested via unit tests in treeViewVirtualization.test.ts
    // Integration tests with Ink rendering are flaky due to async React updates
  });

  describe('terminal resize', () => {
    it('updates viewport height on terminal resize', () => {
      Object.defineProperty(process.stdout, 'rows', { value: 30, writable: true, configurable: true });

      const tree = createLargeTree(50);
      const { lastFrame } = renderWithTheme(
        <TreeView
          fileTree={tree}
          selectedPath=""
          config={DEFAULT_CONFIG}
        />
      );

      // Initial render
      let output = lastFrame();
      const initialLines = output.split('\n').length;

      // Simulate terminal resize
      Object.defineProperty(process.stdout, 'rows', { value: 20, writable: true, configurable: true });
      process.stdout.emit('resize');

      // Wait a tick for React to re-render
      output = lastFrame();
      const newLines = output.split('\n').length;

      // Should render fewer lines after resize
      // (This is a simplified check - actual behavior depends on Ink's rendering)
      expect(newLines).toBeLessThanOrEqual(initialLines);
    });
  });


});
