import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { FileNode } from '../../src/components/FileNode.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import type { TreeNode as TreeNodeType, GitStatus } from '../../src/types/index.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';

describe('FileNode', () => {
  const mockConfig = DEFAULT_CONFIG;
  const mockOnSelect = vi.fn();
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
    if (showGitStatus && node.gitStatus === 'added') return 'green';
    if (showGitStatus && node.gitStatus === 'deleted') return 'red';
    return 'white';
  };

  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider mode="dark">
        {component}
      </ThemeProvider>
    );
  };

  it('renders file with generic icon', () => {
    const node: TreeNodeType = {
      name: 'test.txt',
      path: '/test.txt',
      type: 'file',
      depth: 0,
    };

    const { lastFrame } = renderWithTheme(
      <FileNode
        node={node}
        selected={false}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    expect(lastFrame()).toContain(' test.txt');
  });

  it('applies proper indentation based on depth', () => {
    const node: TreeNodeType = {
      name: 'deep.txt',
      path: '/a/b/c/deep.txt',
      type: 'file',
      depth: 3,
    };

    const { lastFrame } = renderWithTheme(
      <FileNode
        node={node}
        selected={false}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    // depth=3, treeIndent=2 -> 6 spaces
    expect(lastFrame()).toMatch(/\s{6} deep\.txt/);
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
      <FileNode
        node={node}
        selected={false}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
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
      <FileNode
        node={node}
        selected={false}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
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
      <FileNode
        node={node}
        selected={false}
        config={configNoGit}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    // Should NOT contain the M marker
    expect(lastFrame()).not.toContain(' M');
    expect(lastFrame()).toContain('modified.txt');
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
      <FileNode
        node={node}
        selected={false}
        config={customConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    // depth=2, treeIndent=4 -> 8 spaces
    expect(lastFrame()).toMatch(/\s{8} file\.txt/);
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
        <FileNode
          node={node}
          selected={false}
          config={mockConfig}
          mapGitStatusMarker={mockMapGitStatusMarker}
          getNodeColor={mockGetNodeColor}
        />
      );

      expect(lastFrame()).toContain(`${status}.txt ${marker}`);
    });
  });

  it('dims deleted files but not selected ones', () => {
    const deletedNode: TreeNodeType = {
      name: 'deleted.txt',
      path: '/deleted.txt',
      type: 'file',
      depth: 0,
      gitStatus: 'deleted',
    };

    const selectedDeletedNode: TreeNodeType = {
      name: 'selected-deleted.txt',
      path: '/selected-deleted.txt',
      type: 'file',
      depth: 0,
      gitStatus: 'deleted',
    };

    const { lastFrame: deletedFrame } = renderWithTheme(
      <FileNode
        node={deletedNode}
        selected={false}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    const { lastFrame: selectedFrame } = renderWithTheme(
      <FileNode
        node={selectedDeletedNode}
        selected={true}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    // Both should render (no crashes)
    expect(deletedFrame()).toContain('deleted.txt');
    expect(selectedFrame()).toContain('selected-deleted.txt');
  });

  it('renders file at root level (depth 0)', () => {
    const node: TreeNodeType = {
      name: 'README.md',
      path: '/README.md',
      type: 'file',
      depth: 0,
    };

    const { lastFrame } = renderWithTheme(
      <FileNode
        node={node}
        selected={false}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    // Should have no indentation (depth 0)
    // Expects Markdown icon 
    expect(lastFrame()).toMatch(/^ README\.md/);
  });

  it('renders deeply nested file correctly', () => {
    const node: TreeNodeType = {
      name: 'utils.ts',
      path: '/src/app/components/shared/utils.ts',
      type: 'file',
      depth: 5,
    };

    const { lastFrame } = renderWithTheme(
      <FileNode
        node={node}
        selected={false}
        config={mockConfig}
        mapGitStatusMarker={mockMapGitStatusMarker}
        getNodeColor={mockGetNodeColor}
      />
    );

    // depth=5, treeIndent=2 -> 10 spaces
    // Expects TS icon 
    expect(lastFrame()).toMatch(/\s{10} utils\.ts/);
  });
});