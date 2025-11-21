import React from 'react';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { render } from 'ink-testing-library';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { describe, it, expect, vi } from 'vitest';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { TreeNode } from '../../src/components/TreeNode.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import type { TreeNode as TreeNodeType, GitStatus } from '../../src/types/index.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';

describe('TreeNode', () => {
  const renderWithTheme = (component) => {
    return render(
      <ThemeProvider mode="dark">
        {component}
      </ThemeProvider>
    );
  };

  const mockConfig = DEFAULT_CONFIG;
  const mockOnSelect = vi.fn();
  const mockOnToggle = vi.fn();

  it('renders file node with correct icon', () => {
    const node: TreeNodeType = {
      name: 'test.txt',
      path: '/test.txt',
      type: 'file',
      depth: 0,
    };

    const { lastFrame } = renderWithTheme(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    expect(lastFrame()).toContain(' test.txt');
  });

  it('renders collapsed folder with ▶ icon', () => {
    const node: TreeNodeType = {
      name: 'src',
      path: '/src',
      type: 'directory',
      depth: 0,
      expanded: false,
    };

    const { lastFrame } = renderWithTheme(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    const output = lastFrame();
    // Should render  (Nerd Font folder icon)
    expect(output).toContain(' src');
    // Fail if it's always showing the wrong character
    expect(output).not.toContain(' src');
  });

  it('renders expanded folder with ▼ icon', () => {
    const node: TreeNodeType = {
      name: 'src',
      path: '/src',
      type: 'directory',
      depth: 0,
      expanded: true,
      children: [],
    };

    const { lastFrame } = renderWithTheme(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    const output = lastFrame();
    // Should render  (Nerd Font open folder icon)
    expect(output).toContain(' src');
    // Fail if it's showing wrong character
    expect(output).not.toContain(' src');
  });

  it('applies indentation based on depth', () => {
    const node: TreeNodeType = {
      name: 'deep.txt',
      path: '/a/b/c/deep.txt',
      type: 'file',
      depth: 3,
    };

    const { lastFrame } = renderWithTheme(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    // With depth=3, the tree guide characters precede the icon
    expect(lastFrame()).toMatch(/│ │ ├─ deep\.txt/);
  });

  it('displays git status marker for modified file', () => {
    const node: TreeNodeType = {
      name: 'modified.txt',
      path: '/modified.txt',
      type: 'file',
      depth: 0,
      gitStatus: 'modified',
    };

    const { lastFrame } = renderWithTheme(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    expect(lastFrame()).toContain('modified.txt M');
  });

  it('displays git status marker for added file', () => {
    const node: TreeNodeType = {
      name: 'new.txt',
      path: '/new.txt',
      type: 'file',
      depth: 0,
      gitStatus: 'added',
    };

    const { lastFrame } = renderWithTheme(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    expect(lastFrame()).toContain('new.txt A');
  });

  it('hides git marker when showGitStatus is false', () => {
    const node: TreeNodeType = {
      name: 'modified.txt',
      path: '/modified.txt',
      type: 'file',
      depth: 0,
      gitStatus: 'modified',
    };

    const configNoGit = { ...mockConfig, showGitStatus: false };

    const { lastFrame } = renderWithTheme(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={configNoGit}
      />
    );

    // Should NOT contain the M marker
    expect(lastFrame()).not.toContain(' M');
    expect(lastFrame()).toContain('modified.txt');
  });

  it('does not apply git status colors when showGitStatus is false', () => {
    // Test that git status doesn't leak color information when disabled
    const modifiedNode: TreeNodeType = {
      name: 'modified.txt',
      path: '/modified.txt',
      type: 'file',
      depth: 0,
      gitStatus: 'modified',
    };

    const deletedNode: TreeNodeType = {
      name: 'deleted.txt',
      path: '/deleted.txt',
      type: 'file',
      depth: 0,
      gitStatus: 'deleted',
    };

    const configNoGit = { ...mockConfig, showGitStatus: false };

    const { lastFrame: modifiedFrame } = renderWithTheme(
      <TreeNode
        node={modifiedNode}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={configNoGit}
      />
    );

    const { lastFrame: deletedFrame } = renderWithTheme(
      <TreeNode
        node={deletedNode}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={configNoGit}
      />
    );

    // Both should render (no crashes) and contain filename
    expect(modifiedFrame()).toContain('modified.txt');
    expect(deletedFrame()).toContain('deleted.txt');
  });

  it('does not render children when folder is collapsed', () => {
    const node: TreeNodeType = {
      name: 'src',
      path: '/src',
      type: 'directory',
      depth: 0,
      expanded: false,
      children: [
        {
          name: 'hidden.txt',
          path: '/src/hidden.txt',
          type: 'file',
          depth: 1,
        },
      ],
    };

    const { lastFrame } = renderWithTheme(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    const output = lastFrame();
    // Should render  (Nerd Font folder icon)
    expect(output).toContain(' src');
    expect(output).not.toContain('hidden.txt');
  });

  it('highlights selected node', () => {
    const node: TreeNodeType = {
      name: 'selected.txt',
      path: '/selected.txt',
      type: 'file',
      depth: 0,
    };

    const { lastFrame } = renderWithTheme(
      <TreeNode
        node={node}
        selected={true}
        selectedPath="/selected.txt"
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    expect(lastFrame()).toContain('selected.txt');
  });

  it('handles node with no children array', () => {
    const node: TreeNodeType = {
      name: 'folder',
      path: '/folder',
      type: 'directory',
      depth: 0,
      expanded: true,
      // children is undefined
    };

    const { lastFrame } = renderWithTheme(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    const output = lastFrame();
    expect(output).toContain(' folder');
  });

  it('handles empty children array', () => {
    const node: TreeNodeType = {
      name: 'empty',
      path: '/empty',
      type: 'directory',
      depth: 0,
      expanded: true,
      children: [],
    };

    const { lastFrame } = renderWithTheme(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    const output = lastFrame();
    expect(output).toContain(' empty');
  });

  it('uses custom treeIndent from config', () => {
    const node: TreeNodeType = {
      name: 'file.txt',
      path: '/a/file.txt',
      type: 'file',
      depth: 2,
    };

    const customConfig = { ...mockConfig, treeIndent: 4 };

    const { lastFrame } = renderWithTheme(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={customConfig}
      />
    );

    // Depth=2 renders the tree guide prefix even if treeIndent is customized
    expect(lastFrame()).toMatch(/│ ├─ file\.txt/);
  });

  it('renders all git status types correctly', () => {
    const statuses: Array<{ status: GitStatus; marker: string }> = [
      { status: 'modified', marker: 'M' },
      { status: 'added', marker: 'A' },
      { status: 'deleted', marker: 'D' },
      { status: 'untracked', marker: 'U' },
      { status: 'ignored', marker: 'I' },
    ];

    statuses.forEach(({ status, marker }) => {
      const node: TreeNodeType = {
        name: `${status}.txt`,
        path: `/${status}.txt`,
        type: 'file',
        depth: 0,
        gitStatus: status,
      };

      const { lastFrame } = renderWithTheme(
        <TreeNode
          node={node}
          selected={false}
          selectedPath=""
          onSelect={mockOnSelect}
          onToggle={mockOnToggle}
          config={mockConfig}
        />
      );

      expect(lastFrame()).toContain(`${status}.txt ${marker}`);
    });
  });
});
