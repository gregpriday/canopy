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
    { path: 'src/index.ts', status: 'modified' },
    { path: 'README.md', status: 'added' },
  ],
  changedFileCount: 2,
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
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Refining dashboard layout');
    expect(output).toContain('2 files');
  });

  it('shows change list when expanded', () => {
    const { lastFrame } = renderWithTheme(
      <WorktreeCard
        worktree={baseWorktree}
        changes={baseChanges}
        mood="stable"
        isFocused={false}
        isExpanded
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('src/index.ts');
    expect(output).toContain('README.md');
  });

  it('hides change list when collapsed', () => {
    const { lastFrame } = renderWithTheme(
      <WorktreeCard
        worktree={baseWorktree}
        changes={baseChanges}
        mood="stable"
        isFocused={false}
        isExpanded={false}
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    expect(lastFrame()).not.toContain('src/index.ts');
  });

  it('shows footer hints only when focused', () => {
    const { lastFrame, rerender } = renderWithTheme(
      <WorktreeCard
        worktree={baseWorktree}
        changes={baseChanges}
        mood="stable"
        isFocused={true}
        isExpanded={false}
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    expect(lastFrame()).toContain('CopyTree');

    rerender(
      <ThemeProvider mode="dark">
        <WorktreeCard
          worktree={baseWorktree}
          changes={baseChanges}
          mood="stable"
          isFocused={false}
          isExpanded={false}
          onToggleExpand={vi.fn()}
          onCopyTree={vi.fn()}
          onOpenEditor={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(lastFrame()).not.toContain('CopyTree');
  });

  it('limits visible changes and shows overflow indicator', () => {
    const manyChanges: WorktreeChanges = {
      ...baseChanges,
      changes: Array.from({ length: 12 }, (_, index) => ({
        path: `file-${index}.ts`,
        status: 'modified' as const,
      })),
      changedFileCount: 12,
    };

    const { lastFrame } = renderWithTheme(
      <WorktreeCard
        worktree={baseWorktree}
        changes={manyChanges}
        mood="active"
        isFocused={false}
        isExpanded
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('file-0.ts');
    expect(output).not.toContain('file-11.ts');
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
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />,
    );

    expect(spy).toHaveBeenCalledWith('error');
    spy.mockRestore();
  });
});
