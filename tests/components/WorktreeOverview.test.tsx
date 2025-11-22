import React from 'react';
import { Box, Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Worktree, WorktreeChanges } from '../../src/types/index.js';

const capturedProps: any[] = [];

vi.mock('../../src/components/WorktreeCard.js', () => ({
  WorktreeCard: (props: any) => {
    capturedProps.push({
      ...props,
      worktree: { ...props.worktree },
      worktreeId: props.worktree.id,
    });
    return (
      <Box>
        <Text>{props.worktree.branch || props.worktree.name}</Text>
      </Box>
    );
  },
}));

import { WorktreeOverview, sortWorktrees } from '../../src/components/WorktreeOverview.js';

const makeChanges = (id: string): WorktreeChanges => ({
  worktreeId: id,
  rootPath: `/repo/${id}`,
  changes: [],
  changedFileCount: 0,
  lastUpdated: Date.now(),
});

describe('WorktreeOverview', () => {
  beforeEach(() => {
    capturedProps.length = 0;
  });

  it('sorts main first then by mood priority', () => {
    const worktrees: Worktree[] = [
      { id: 'feature', path: '/repo/feature', name: 'feature', branch: 'feature', isCurrent: false, mood: 'active' },
      { id: 'main', path: '/repo/main', name: 'main', branch: 'main', isCurrent: true, mood: 'stable' },
      { id: 'bugfix', path: '/repo/bugfix', name: 'bugfix', branch: 'bugfix', isCurrent: false, mood: 'stale' },
    ];

    const sorted = sortWorktrees(worktrees);
    expect(sorted[0].id).toBe('main');
    expect(sorted[1].id).toBe('feature');
    expect(sorted[2].id).toBe('bugfix');
  });

  it('forwards expand handler with correct id', () => {
    const toggleSpy = vi.fn();
    const worktrees: Worktree[] = [
      { id: 'alpha', path: '/repo/alpha', name: 'alpha', branch: 'alpha', isCurrent: true, mood: 'stable' },
    ];
    const changes = new Map<string, WorktreeChanges>([['alpha', makeChanges('alpha')]]);

    render(
      <WorktreeOverview
        worktrees={worktrees}
        worktreeChanges={changes}
        activeWorktreeId="alpha"
        focusedWorktreeId="alpha"
        expandedWorktreeIds={new Set()}
        onToggleExpand={toggleSpy}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />
    );

    expect(capturedProps[0]).toBeDefined();
    capturedProps[0].onToggleExpand();
    expect(toggleSpy).toHaveBeenCalledWith('alpha');
  });

  it('applies visible window bounds', () => {
    const worktrees: Worktree[] = [
      { id: 'alpha', path: '/repo/alpha', name: 'alpha', branch: 'alpha', isCurrent: true, mood: 'stable' },
      { id: 'beta', path: '/repo/beta', name: 'beta', branch: 'beta', isCurrent: false, mood: 'stable' },
      { id: 'charlie', path: '/repo/charlie', name: 'charlie', branch: 'charlie', isCurrent: false, mood: 'stable' },
    ];
    const sorted = sortWorktrees(worktrees);
    expect(sorted.map(wt => wt.id)).toEqual(['alpha', 'beta', 'charlie']);
    const changes = new Map<string, WorktreeChanges>(worktrees.map(wt => [wt.id, makeChanges(wt.id)]));

    const { lastFrame } = render(
      <WorktreeOverview
        worktrees={worktrees}
        worktreeChanges={changes}
        activeWorktreeId="alpha"
        focusedWorktreeId="alpha"
        expandedWorktreeIds={new Set()}
        visibleStart={1}
        visibleEnd={3}
        onToggleExpand={vi.fn()}
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('beta');
    expect(frame).toContain('charlie');
    expect(frame).not.toContain('alpha');
  });
});
