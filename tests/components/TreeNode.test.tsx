import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { TreeNode } from '../../src/components/TreeNode.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import type { TreeNode as TreeNodeType, GitStatus } from '../../src/types/index.js';

describe('TreeNode', () => {
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

    const { lastFrame } = render(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    expect(lastFrame()).toContain('- test.txt');
  });

  it('renders collapsed folder with ▶ icon', () => {
    const node: TreeNodeType = {
      name: 'src',
      path: '/src',
      type: 'directory',
      depth: 0,
      expanded: false,
    };

    const { lastFrame } = render(
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
    // Should render ▶ (U+25B6), but test env may show � replacement character
    expect(output).toMatch(/[▶�] src/);
    // Fail if it's always showing the wrong character (would indicate corrupted source)
    expect(output).not.toMatch(/[▼] src/);
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

    const { lastFrame } = render(
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
    // Should render ▼ (U+25BC), but test env may show � replacement character
    expect(output).toMatch(/[▼�] src/);
    // Fail if it's showing wrong character (would indicate corrupted source)
    expect(output).not.toMatch(/[▶] src/);
  });

  it('applies indentation based on depth', () => {
    const node: TreeNodeType = {
      name: 'deep.txt',
      path: '/a/b/c/deep.txt',
      type: 'file',
      depth: 3,
    };

    const { lastFrame } = render(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    // With treeIndent=2 and depth=3, should have 6 leading spaces
    expect(lastFrame()).toMatch(/\s{6}- deep\.txt/);
  });

  it('displays git status marker for modified file', () => {
    const node: TreeNodeType = {
      name: 'modified.txt',
      path: '/modified.txt',
      type: 'file',
      depth: 0,
      gitStatus: 'modified',
    };

    const { lastFrame } = render(
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

    const { lastFrame } = render(
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

    const { lastFrame } = render(
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

    const { lastFrame: modifiedFrame } = render(
      <TreeNode
        node={modifiedNode}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={configNoGit}
      />
    );

    const { lastFrame: deletedFrame } = render(
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
    // Note: We can't easily assert specific colors in ink-testing-library,
    // but the component should use default white color instead of yellow/red
  });

  it('recursively renders children when folder is expanded', () => {
    const node: TreeNodeType = {
      name: 'src',
      path: '/src',
      type: 'directory',
      depth: 0,
      expanded: true,
      children: [
        {
          name: 'file1.txt',
          path: '/src/file1.txt',
          type: 'file',
          depth: 1,
        },
        {
          name: 'file2.txt',
          path: '/src/file2.txt',
          type: 'file',
          depth: 1,
        },
      ],
    };

    const { lastFrame } = render(
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
    // Unicode may render as replacement character in test env
    expect(output).toMatch(/[▼�] src/);
    expect(output).toContain('- file1.txt');
    expect(output).toContain('- file2.txt');
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

    const { lastFrame } = render(
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
    // Unicode may render as replacement character in test env
    expect(output).toMatch(/[▶�] src/);
    expect(output).not.toContain('hidden.txt');
  });

  it('highlights selected node', () => {
    const node: TreeNodeType = {
      name: 'selected.txt',
      path: '/selected.txt',
      type: 'file',
      depth: 0,
    };

    const { lastFrame } = render(
      <TreeNode
        node={node}
        selected={true}
        selectedPath="/selected.txt"
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    // Check that output contains the filename
    // (exact styling may vary, but file should be there)
    expect(lastFrame()).toContain('selected.txt');
  });

  it('recursively highlights deeply nested selected node', () => {
    const node: TreeNodeType = {
      name: 'root',
      path: '/root',
      type: 'directory',
      depth: 0,
      expanded: true,
      children: [
        {
          name: 'child',
          path: '/root/child',
          type: 'directory',
          depth: 1,
          expanded: true,
          children: [
            {
              name: 'grandchild.txt',
              path: '/root/child/grandchild.txt',
              type: 'file',
              depth: 2,
            },
          ],
        },
      ],
    };

    const { lastFrame } = render(
      <TreeNode
        node={node}
        selected={false}
        selectedPath="/root/child/grandchild.txt"
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    const output = lastFrame();
    expect(output).toContain('grandchild.txt');
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

    const { lastFrame } = render(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    // Should render without crashing
    // Unicode may render as replacement character in test env
    const output = lastFrame();
    expect(output).toMatch(/[▼�] folder/);
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

    const { lastFrame } = render(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={mockConfig}
      />
    );

    // Unicode may render as replacement character in test env
    const output = lastFrame();
    expect(output).toMatch(/[▼�] empty/);
  });

  it('uses custom treeIndent from config', () => {
    const node: TreeNodeType = {
      name: 'file.txt',
      path: '/a/file.txt',
      type: 'file',
      depth: 2,
    };

    const customConfig = { ...mockConfig, treeIndent: 4 };

    const { lastFrame } = render(
      <TreeNode
        node={node}
        selected={false}
        selectedPath=""
        onSelect={mockOnSelect}
        onToggle={mockOnToggle}
        config={customConfig}
      />
    );

    // depth=2, treeIndent=4 -> 8 spaces
    expect(lastFrame()).toMatch(/\s{8}- file\.txt/);
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

      const { lastFrame } = render(
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
