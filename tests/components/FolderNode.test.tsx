import React from 'react';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { render } from 'ink-testing-library';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { describe, it, expect, vi } from 'vitest';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { FolderNode } from '../../src/components/FolderNode.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import type { TreeNode as TreeNodeType, GitStatus } from '../../src/types/index.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';

describe('FolderNode', () => {
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
  const mockMapGitStatusMarker = (status: GitStatus) => {
    const markers: Record<GitStatus, string> = {
      modified: 'M',
      added: 'A',
      deleted: 'D',
      untracked: 'U',
      ignored: 'I',
    };
    return markers[status];
  };
  const mockGetNodeColor = (
    node: TreeNodeType,
    selected: boolean,
    showGitStatus: boolean
  ) => {
    if (selected) return 'cyan';
    if (showGitStatus && node.gitStatus === 'modified') return 'yellow';
    if (node.type === 'directory') return 'blue';
    return 'white';
  };
  it('renders collapsed folder with ▶ icon', () => {
    const node: TreeNodeType = {
      name: 'src',
      path: '/src',
      type: 'directory',
      depth: 0,
      expanded: false,
    };

    const { lastFrame } = renderWithTheme(
      <FolderNode
        node={node}
        selected={false}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    const output = lastFrame();
    // Should render ▶ (U+25B6), but test env may show  replacement character
    expect(output).toMatch(/ src/);
    expect(output).not.toMatch(/ src/);
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
      <FolderNode
        node={node}
        selected={false}
        
        
        
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    const output = lastFrame();
    // Should render ▼ (U+25BC), but test env may show  replacement character
    expect(output).toMatch(/ src/);
    expect(output).not.toMatch(/ src/);
  });

  it('applies proper indentation based on depth', () => {
    const node: TreeNodeType = {
      name: 'nested',
      path: '/a/b/c/nested',
      type: 'directory',
      depth: 3,
      expanded: false,
    };

    const { lastFrame } = renderWithTheme(
      <FolderNode
        node={node}
        selected={false}
        
        
        
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    // depth=3, treeIndent=2 -> 6 spaces
    expect(lastFrame()).toMatch(/\s{6} nested/);
  });

  it('displays git status marker when present', () => {
    const node: TreeNodeType = {
      name: 'modified-folder',
      path: '/modified-folder',
      type: 'directory',
      depth: 0,
      expanded: false,
      gitStatus: 'modified',
    };

    const { lastFrame } = renderWithTheme(
      <FolderNode
        node={node}
        selected={false}
        
        
        
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    expect(lastFrame()).toContain('modified-folder M');
  });

  it('hides git marker when showGitStatus is false', () => {
    const node: TreeNodeType = {
      name: 'modified-folder',
      path: '/modified-folder',
      type: 'directory',
      depth: 0,
      expanded: false,
      gitStatus: 'modified',
    };

    const configNoGit = { ...mockConfig, showGitStatus: false };

    const { lastFrame } = renderWithTheme(
      <FolderNode
        node={node}
        selected={false}
        
        
        
        config={configNoGit}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    // Should NOT contain the M marker
    expect(lastFrame()).not.toContain(' M');
    expect(lastFrame()).toContain('modified-folder');
  });

  it('renders all git status types correctly for folders', () => {
    const statuses: Array<{ status: GitStatus; marker: string }> = [
      { status: 'modified', marker: 'M' },
      { status: 'added', marker: 'A' },
      { status: 'deleted', marker: 'D' },
      { status: 'untracked', marker: 'U' },
      { status: 'ignored', marker: 'I' },
    ];

    statuses.forEach(({ status, marker }) => {
      const node: TreeNodeType = {
        name: `${status}-folder`,
        path: `/${status}-folder`,
        type: 'directory',
        depth: 0,
        expanded: false,
        gitStatus: status,
      };

      const { lastFrame } = renderWithTheme(
        <FolderNode
          node={node}
          selected={false}
          config={mockConfig}
          mapGitStatusMarker={mockMapGitStatusMarker}
          getNodeColor={mockGetNodeColor}
        />
      );

      expect(lastFrame()).toContain(`${status}-folder ${marker}`);
    });
  });

  it('renders folder without children (virtualization handles children)', () => {
    // With virtualization, FolderNode no longer recursively renders children
    // TreeView flattens the tree and renders each node individually
    const node: TreeNodeType = {
      name: 'parent',
      path: '/parent',
      type: 'directory',
      depth: 0,
      expanded: true,
      children: [
        { name: 'child1.txt', path: '/parent/child1.txt', type: 'file', depth: 1 },
        { name: 'child2.txt', path: '/parent/child2.txt', type: 'file', depth: 1 },
      ],
    };

    const { lastFrame } = renderWithTheme(
      <FolderNode
        node={node}
        selected={false}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    const output = lastFrame();
    // Should only render the folder itself, not children
    expect(output).toContain('parent');
    expect(output).not.toContain('child1.txt');
    expect(output).not.toContain('child2.txt');
  });

  it('handles missing children gracefully', () => {
    const node: TreeNodeType = {
      name: 'no-children',
      path: '/no-children',
      type: 'directory',
      depth: 0,
      expanded: true,
      // children is undefined
    };

    const { lastFrame } = renderWithTheme(
      <FolderNode
        node={node}
        selected={false}
        
        
        
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    // Should render without crashing
    expect(lastFrame()).toContain('no-children');
  });

  it('uses custom treeIndent from config', () => {
    const node: TreeNodeType = {
      name: 'folder',
      path: '/a/b/folder',
      type: 'directory',
      depth: 2,
      expanded: false,
    };

    const customConfig = { ...mockConfig, treeIndent: 4 };

    const { lastFrame } = renderWithTheme(
      <FolderNode
        node={node}
        selected={false}
        
        
        
        config={customConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    // depth=2, treeIndent=4 -> 8 spaces
    expect(lastFrame()).toMatch(/\s{8} folder/);
  });

  it('verifies selection styling is applied', () => {
    const mockGetNodeColorSpy = vi.fn(mockGetNodeColor);

    const node: TreeNodeType = {
      name: 'selected-folder',
      path: '/selected-folder',
      type: 'directory',
      depth: 0,
      expanded: false,
    };

    renderWithTheme(
      <FolderNode
        node={node}
        selected={true}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColorSpy}
      />
    );

    // Verify getNodeColor was called with selected=true
    expect(mockGetNodeColorSpy).toHaveBeenCalledWith(node, true, mockConfig.showGitStatus);
  });

  it('displays recursive git count when collapsed and has changes', () => {
    const node: TreeNodeType = {
      name: 'folder-with-changes',
      path: '/folder-with-changes',
      type: 'directory',
      depth: 0,
      expanded: false,
      recursiveGitCount: 5,
    };

    const { lastFrame } = renderWithTheme(
      <FolderNode
        node={node}
        selected={false}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    // Should contain the count in brackets with a gray color
    expect(lastFrame()).toContain('folder-with-changes [5]');
  });

  it('does not display recursive git count when expanded', () => {
    const node: TreeNodeType = {
      name: 'folder-with-changes',
      path: '/folder-with-changes',
      type: 'directory',
      depth: 0,
      expanded: true, // Expanded
      recursiveGitCount: 5,
    };

    const { lastFrame } = renderWithTheme(
      <FolderNode
        node={node}
        selected={false}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    expect(lastFrame()).not.toContain('[5]');
  });

  it('does not display recursive git count when zero', () => {
    const node: TreeNodeType = {
      name: 'folder-no-changes',
      path: '/folder-no-changes',
      type: 'directory',
      depth: 0,
      expanded: false,
      recursiveGitCount: 0, // Zero changes
    };

    const { lastFrame } = renderWithTheme(
      <FolderNode
        node={node}
        selected={false}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    expect(lastFrame()).not.toContain('[0]');
  });
});