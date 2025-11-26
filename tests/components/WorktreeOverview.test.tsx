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
  totalInsertions: 0,
  totalDeletions: 0,
  lastUpdated: Date.now(),
});

describe('WorktreeOverview', () => {
  beforeEach(() => {
    capturedProps.length = 0;
  });

  it('pins main first then sorts by lastActivityTimestamp descending', () => {
    const now = Date.now();
    const worktrees: Worktree[] = [
      { id: 'feature', path: '/repo/feature', name: 'feature', branch: 'feature', isCurrent: false, mood: 'active', lastActivityTimestamp: now - 1000 },
      { id: 'main', path: '/repo/main', name: 'main', branch: 'main', isCurrent: true, mood: 'stable', lastActivityTimestamp: now - 5000 },
      { id: 'bugfix', path: '/repo/bugfix', name: 'bugfix', branch: 'bugfix', isCurrent: false, mood: 'stale', lastActivityTimestamp: now - 500 },
    ];

    const sorted = sortWorktrees(worktrees);
    // main is always first (pinned)
    expect(sorted[0].id).toBe('main');
    // Then sorted by recency: bugfix (500ms ago) > feature (1000ms ago)
    expect(sorted[1].id).toBe('bugfix');
    expect(sorted[2].id).toBe('feature');
  });

  it('sorts stale worktree with recent activity above active worktree with older activity', () => {
    const now = Date.now();
    const worktrees: Worktree[] = [
      { id: 'active-old', path: '/repo/active', name: 'active', branch: 'active-branch', isCurrent: false, mood: 'active', lastActivityTimestamp: now - 10000 },
      { id: 'stale-recent', path: '/repo/stale', name: 'stale', branch: 'stale-branch', isCurrent: false, mood: 'stale', lastActivityTimestamp: now - 500 },
    ];

    const sorted = sortWorktrees(worktrees);
    // stale-recent should be first because it has more recent activity despite being "stale" mood
    expect(sorted[0].id).toBe('stale-recent');
    expect(sorted[1].id).toBe('active-old');
  });

  it('falls back to alphabetical sort when timestamps are equal', () => {
    const sameTime = Date.now();
    const worktrees: Worktree[] = [
      { id: 'zebra', path: '/repo/zebra', name: 'zebra', branch: 'zebra', isCurrent: false, mood: 'stable', lastActivityTimestamp: sameTime },
      { id: 'alpha', path: '/repo/alpha', name: 'alpha', branch: 'alpha', isCurrent: false, mood: 'stable', lastActivityTimestamp: sameTime },
    ];

    const sorted = sortWorktrees(worktrees);
    expect(sorted[0].id).toBe('alpha');
    expect(sorted[1].id).toBe('zebra');
  });

  it('handles null/undefined timestamps by sorting them last', () => {
    const now = Date.now();
    const worktrees: Worktree[] = [
      { id: 'no-activity', path: '/repo/no-activity', name: 'no-activity', branch: 'no-activity', isCurrent: false, mood: 'stable' },
      { id: 'has-activity', path: '/repo/has-activity', name: 'has-activity', branch: 'has-activity', isCurrent: false, mood: 'stable', lastActivityTimestamp: now },
    ];

    const sorted = sortWorktrees(worktrees);
    expect(sorted[0].id).toBe('has-activity');
    expect(sorted[1].id).toBe('no-activity');
  });

  it('returns empty array for empty input', () => {
    const sorted = sortWorktrees([]);
    expect(sorted).toEqual([]);
  });

  it('handles all equal timestamps with main pinned', () => {
    const sameTime = Date.now();
    const worktrees: Worktree[] = [
      { id: 'zebra', path: '/repo/zebra', name: 'zebra', branch: 'zebra', isCurrent: false, mood: 'stable', lastActivityTimestamp: sameTime },
      { id: 'main', path: '/repo/main', name: 'main', branch: 'main', isCurrent: true, mood: 'stable', lastActivityTimestamp: sameTime },
      { id: 'alpha', path: '/repo/alpha', name: 'alpha', branch: 'alpha', isCurrent: false, mood: 'stable', lastActivityTimestamp: sameTime },
    ];

    const sorted = sortWorktrees(worktrees);
    // main is always first (pinned)
    expect(sorted[0].id).toBe('main');
    // Then alphabetically: alpha before zebra
    expect(sorted[1].id).toBe('alpha');
    expect(sorted[2].id).toBe('zebra');
  });

  it('renders cards with correct props', () => {
    const worktrees: Worktree[] = [
      { id: 'alpha', path: '/repo/alpha', name: 'alpha', branch: 'alpha', isCurrent: true, mood: 'stable' },
    ];
    const changes = new Map<string, WorktreeChanges>([['alpha', makeChanges('alpha')]]);

    render(
      <WorktreeOverview
        worktrees={worktrees}
        worktreeChanges={changes}
        activeWorktreeId="alpha"
        activeRootPath="/repo/alpha"
        focusedWorktreeId="alpha"
        onCopyTree={vi.fn()}
        onOpenEditor={vi.fn()}
      />
    );

    expect(capturedProps[0]).toBeDefined();
    expect(capturedProps[0].worktreeId).toBe('alpha');
    expect(capturedProps[0].isFocused).toBe(true);
  });

  it('applies visible window bounds', () => {
    const now = Date.now();
    // Use timestamps to control ordering: alpha (newest) > beta > charlie (oldest)
    const worktrees: Worktree[] = [
      { id: 'alpha', path: '/repo/alpha', name: 'alpha', branch: 'alpha', isCurrent: true, mood: 'stable', lastActivityTimestamp: now },
      { id: 'beta', path: '/repo/beta', name: 'beta', branch: 'beta', isCurrent: false, mood: 'stable', lastActivityTimestamp: now - 1000 },
      { id: 'charlie', path: '/repo/charlie', name: 'charlie', branch: 'charlie', isCurrent: false, mood: 'stable', lastActivityTimestamp: now - 2000 },
    ];
    const sorted = sortWorktrees(worktrees);
    expect(sorted.map(wt => wt.id)).toEqual(['alpha', 'beta', 'charlie']);
    const changes = new Map<string, WorktreeChanges>(worktrees.map(wt => [wt.id, makeChanges(wt.id)]));

    const { lastFrame } = render(
      <WorktreeOverview
        worktrees={worktrees}
        worktreeChanges={changes}
        activeWorktreeId="alpha"
        activeRootPath="/repo/alpha"
        focusedWorktreeId="alpha"
        visibleStart={1}
        visibleEnd={3}
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
