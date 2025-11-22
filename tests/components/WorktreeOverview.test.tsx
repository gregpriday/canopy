import React from 'react';
import { Box } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Worktree, WorktreeChanges } from '../../src/types/index.js';

const capturedProps: any[] = [];

vi.mock('../../src/components/WorktreeCard.js', () => ({
  WorktreeCard: (props: any) => {
    capturedProps.push(props);
    return <Box>{props.worktree.branch || props.worktree.name}</Box>;
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
});
