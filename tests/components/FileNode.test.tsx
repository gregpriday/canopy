import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { FileNode } from '../../src/components/FileNode.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import type { TreeNode, YellowwoodConfig, GitStatus } from '../../src/types/index.js';

describe('FileNode', () => {
  const createFileNode = (overrides: Partial<TreeNode> = {}): TreeNode => ({
    name: 'test.ts',
    path: '/test/test.ts',
    type: 'file',
    depth: 0,
    ...overrides,
  });

  it('renders file name with icon', () => {
    const node = createFileNode();
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={false} />
    );

    expect(lastFrame()).toContain('test.ts');
    expect(lastFrame()).toContain('-'); // File icon
  });

  it('applies indentation based on depth', () => {
    const node = createFileNode({ depth: 2 });
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={false} />
    );

    // depth=2, treeIndent=2 → 4 spaces at start
    expect(lastFrame()).toMatch(/^\s{4}/);
  });

  it('shows git status marker when enabled', () => {
    const node = createFileNode({ gitStatus: 'modified' });
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={false} />
    );

    expect(lastFrame()).toContain('M');
  });

  it('hides git status marker when config disabled', () => {
    const node = createFileNode({ gitStatus: 'modified' });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showGitStatus: false,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );

    expect(lastFrame()).not.toContain('M');
  });

  it('does not apply git status colors when showGitStatus is disabled', () => {
    const node = createFileNode({ gitStatus: 'modified' });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showGitStatus: false,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );

    // File should be rendered but without git status marker
    const frame = lastFrame();
    expect(frame).toContain('test.ts');
    expect(frame).not.toContain('M');
  });

  it('shows file size when enabled', () => {
    const node = createFileNode({ size: 2468 });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );

    expect(lastFrame()).toContain('2.4 KB');
  });

  it('hides file size when config disabled', () => {
    const node = createFileNode({ size: 2468 });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: false,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );

    expect(lastFrame()).not.toContain('KB');
  });

  it('shows modified time when enabled', () => {
    const node = createFileNode({ modified: new Date('2025-11-18') });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showModifiedTime: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );

    expect(lastFrame()).toContain('2025-11-18');
  });

  it('hides modified time when config disabled', () => {
    const node = createFileNode({ modified: new Date('2025-11-18') });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showModifiedTime: false,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );

    expect(lastFrame()).not.toContain('2025-11-18');
  });

  it('highlights selected file', () => {
    const node = createFileNode();
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={true} />
    );

    // Should have selection indicator
    expect(lastFrame()).toContain('>');
  });

  it('shows correct git status characters for modified', () => {
    const node = createFileNode({ gitStatus: 'modified' });
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={false} />
    );
    expect(lastFrame()).toContain('M');
  });

  it('shows correct git status characters for added', () => {
    const node = createFileNode({ gitStatus: 'added' });
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={false} />
    );
    expect(lastFrame()).toContain('A');
  });

  it('shows correct git status characters for deleted', () => {
    const node = createFileNode({ gitStatus: 'deleted' });
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={false} />
    );
    expect(lastFrame()).toContain('D');
  });

  it('shows correct git status characters for untracked', () => {
    const node = createFileNode({ gitStatus: 'untracked' });
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={false} />
    );
    expect(lastFrame()).toContain('U');
  });

  it('shows correct git status characters for ignored', () => {
    const node = createFileNode({ gitStatus: 'ignored' });
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={false} />
    );
    expect(lastFrame()).toContain('I');
  });

  it('formats file size as 0 B for zero bytes', () => {
    const node = createFileNode({ size: 0 });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );
    expect(lastFrame()).toContain('0 B');
  });

  it('formats file size as bytes for small files', () => {
    const node = createFileNode({ size: 156 });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );
    expect(lastFrame()).toContain('156 B');
  });

  it('formats file size as KB for kilobyte files', () => {
    const node = createFileNode({ size: 1024 });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );
    expect(lastFrame()).toContain('1.0 KB');
  });

  it('formats file size as MB for megabyte files', () => {
    const node = createFileNode({ size: 1048576 });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );
    expect(lastFrame()).toContain('1.0 MB');
  });

  it('formats file size as GB for gigabyte files', () => {
    const node = createFileNode({ size: 1073741824 });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );
    expect(lastFrame()).toContain('1.0 GB');
  });

  it('handles missing optional fields gracefully', () => {
    const node = createFileNode({
      size: undefined,
      modified: undefined,
      gitStatus: undefined,
    });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: true,
      showModifiedTime: true,
      showGitStatus: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );

    // Should render file name without crashing
    expect(lastFrame()).toContain('test.ts');
  });

  it('formats file size as TB for terabyte files', () => {
    const node = createFileNode({ size: 1099511627776 }); // 1 TB
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );
    expect(lastFrame()).toContain('1.0 TB');
  });

  it('formats file size as PB for petabyte files', () => {
    const node = createFileNode({ size: 1125899906842624 }); // 1 PB
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );
    expect(lastFrame()).toContain('1.0 PB');
  });

  it('handles invalid file size gracefully', () => {
    const node = createFileNode({ size: -100 });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );
    expect(lastFrame()).toContain('0 B');
  });

  it('handles invalid date gracefully', () => {
    const node = createFileNode({ modified: new Date('invalid') });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showModifiedTime: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );
    // Invalid date should not appear in output
    const frame = lastFrame();
    expect(frame).toContain('test.ts');
    expect(frame).not.toContain('NaN');
  });

  it('uses custom tree indent from config', () => {
    const node = createFileNode({ depth: 1 });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      treeIndent: 4,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );

    // depth=1, treeIndent=4 → 4 spaces at start
    expect(lastFrame()).toMatch(/^\s{4}/);
  });

  it('shows selection indicator when selected', () => {
    const node = createFileNode();
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={true} />
    );

    // Selection indicator '>' should be present
    expect(lastFrame()).toContain('>');
  });

  it('shows no selection indicator when not selected', () => {
    const node = createFileNode();
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={false} />
    );

    // First check that we have file content
    const frame = lastFrame();
    expect(frame).toContain('test.ts');

    // The selection indicator '>' should not be at the start where we expect it
    // Since not selected, we expect '  ' (two spaces) instead of '> '
    // We can verify by checking that after indent, there's no '>'
    const lines = frame?.split('\n') || [];
    const fileLine = lines.find(line => line.includes('test.ts'));
    expect(fileLine).toBeDefined();

    // The line should have spaces but not the '>' indicator in the selection position
    // After indentation (depth=0 means no indent), we should see '  -' not '> -'
    expect(fileLine).toMatch(/^\s*\s\s-/); // Two spaces before dash
  });

  it('displays all metadata when all options enabled', () => {
    const node = createFileNode({
      size: 2468,
      modified: new Date('2025-11-18'),
      gitStatus: 'modified',
    });
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: true,
      showModifiedTime: true,
      showGitStatus: true,
    };
    const { lastFrame } = render(
      <FileNode node={node} config={config} isSelected={false} />
    );

    const frame = lastFrame();
    expect(frame).toContain('test.ts');
    expect(frame).toContain('2.4 KB');
    expect(frame).toContain('2025-11-18');
    expect(frame).toContain('M');
  });

  it('handles zero depth correctly', () => {
    const node = createFileNode({ depth: 0 });
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={false} />
    );

    // depth=0 means no indentation at the start
    // Should start with selection indicator (2 spaces) then dash
    const frame = lastFrame();
    expect(frame).toContain('test.ts');
    // No leading spaces before the selection indicator
    expect(frame).toMatch(/^\s{0,2}-/);
  });

  it('handles deep nesting correctly', () => {
    const node = createFileNode({ depth: 5 });
    const { lastFrame } = render(
      <FileNode node={node} config={DEFAULT_CONFIG} isSelected={false} />
    );

    // depth=5, treeIndent=2 → 10 spaces at start
    expect(lastFrame()).toMatch(/^\s{10}/);
  });
});
