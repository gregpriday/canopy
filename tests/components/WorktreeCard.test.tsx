import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { WorktreeCard } from '../../src/components/WorktreeCard.js';
import type { Worktree, WorktreeChanges } from '../../src/types/index.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { getBorderColorForMood } from '../../src/utils/moodColors.js';
import * as moodColors from '../../src/utils/moodColors.js';

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider mode="dark">{component}</ThemeProvider>);

const baseWorktree: Worktree = {
  id: 'wt-1',
  path: '/repo/main',
  name: 'main',
  branch: 'main',
  isCurrent: true,
  summary: 'Refining dashboard layout',
};

const baseChanges: WorktreeChanges = {
  worktreeId: 'wt-1',
  rootPath: '/repo/main',
  changes: [
    { path: 'src/index.ts', status: 'modified', insertions: 10, deletions: 2 },
    { path: 'README.md', status: 'added', insertions: 2, deletions: 0 },
  ],
  changedFileCount: 2,
  totalInsertions: 12,
  totalDeletions: 2,
  lastUpdated: Date.now(),
};

describe('WorktreeCard', () => {
  it('maps moods to border colors', () => {
    expect(getBorderColorForMood('active')).toBe('yellow');
    expect(getBorderColorForMood('stable')).toBe('green');
  });

  it('renders summary and file count in the header', () => {
    const { lastFrame } = renderWithTheme(
      <WorktreeCard
        worktree={baseWorktree}
        changes={baseChanges}
        mood="stable"
        isFocused={false}
        isExpanded={false}
        activeRootPath="/repo/main"
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Refining dashboard layout');
    expect(output).toContain('2 files');
    expect(output).toContain('+12');
    expect(output).toContain('-2');
  });

  it('shows relative path for non-current worktrees only', () => {
    const secondaryWorktree: Worktree = {
      ...baseWorktree,
      id: 'wt-2',
      path: '/repo/feature',
      name: 'feature',
      branch: 'feature',
      isCurrent: false,
    };

    const { lastFrame: activeFrame } = renderWithTheme(
      <WorktreeCard
        worktree={baseWorktree}
        changes={baseChanges}
        mood="stable"
        isFocused={false}
        isExpanded={false}
        activeRootPath="/repo/main"
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    const { lastFrame: secondaryFrame } = renderWithTheme(
      <WorktreeCard
        worktree={secondaryWorktree}
        changes={{ ...baseChanges, worktreeId: secondaryWorktree.id, rootPath: secondaryWorktree.path }}
        mood="stable"
        isFocused={false}
        isExpanded={false}
        activeRootPath="/repo/main"
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    expect(secondaryFrame()).toContain('feature');
  });

  it('shows change list when expanded', () => {
    const { lastFrame } = renderWithTheme(
      <WorktreeCard
        worktree={baseWorktree}
        changes={baseChanges}
        mood="stable"
        isFocused={false}
        isExpanded
        activeRootPath="/repo/main"
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('src/index.ts');
    expect(output).toContain('README.md');
    expect(output).toContain('+10');
    expect(output).toContain('-2');
  });

  it('hides change list when collapsed', () => {
    const { lastFrame } = renderWithTheme(
      <WorktreeCard
        worktree={baseWorktree}
        changes={baseChanges}
        mood="stable"
        isFocused={false}
        isExpanded={false}
        activeRootPath="/repo/main"
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    expect(lastFrame()).not.toContain('src/index.ts');
  });

  it('renders action buttons for CopyTree and editor', () => {
    const { lastFrame } = renderWithTheme(
      <WorktreeCard
        worktree={baseWorktree}
        changes={baseChanges}
        mood="stable"
        isFocused={false}
        isExpanded={false}
        activeRootPath="/repo/main"
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('CopyTree');
    expect(output).toContain('VS Code');
    expect(output).toContain('Expand');
  });

  it('limits visible changes and shows overflow indicator', () => {
    const manyChanges: WorktreeChanges = {
      ...baseChanges,
      changes: Array.from({ length: 12 }, (_, index) => ({
        path: `file-${index}.ts`,
        status: 'modified' as const,
        insertions: index,
        deletions: 0,
      })),
      changedFileCount: 12,
      totalInsertions: 66,
      totalDeletions: 0,
    };

    const { lastFrame } = renderWithTheme(
      <WorktreeCard
        worktree={baseWorktree}
        changes={manyChanges}
        mood="active"
        isFocused={false}
        isExpanded
        activeRootPath="/repo/main"
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('file-11.ts');
    expect(output).not.toContain('file-1.ts');
    expect(output).toContain('...and 2 more');
  });

  it('uses mood color helper for border rendering', () => {
    const spy = vi.spyOn(moodColors, 'getBorderColorForMood');
    renderWithTheme(
      <WorktreeCard
        worktree={baseWorktree}
        changes={baseChanges}
        mood="error"
        isFocused={false}
        isExpanded={false}
        activeRootPath="/repo/main"
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    expect(spy).toHaveBeenCalledWith('error');
    spy.mockRestore();
  });
});
