import React, { useMemo } from 'react';
import { Box } from 'ink';
import type { Worktree, WorktreeChanges, WorktreeMood } from '../types/index.js';
import { WorktreeCard } from './WorktreeCard.js';

export interface WorktreeOverviewProps {
  worktrees: Worktree[];
  worktreeChanges: Map<string, WorktreeChanges>;
  activeWorktreeId: string | null;
  focusedWorktreeId: string | null;
  expandedWorktreeIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onCopyTree: (id: string, profile?: string) => void;
  onOpenEditor: (id: string) => void;
}

const MOOD_PRIORITY: Record<WorktreeMood, number> = {
  active: 1,
  stable: 2,
  stale: 3,
  error: 4,
};

const FALLBACK_CHANGES: WorktreeChanges = {
  worktreeId: '',
  rootPath: '',
  changes: [],
  changedFileCount: 0,
  lastUpdated: 0,
};

export function sortWorktrees(worktrees: Worktree[]): Worktree[] {
  if (worktrees.length === 0) {
    return [];
  }

  const mainIndex = worktrees.findIndex(
    wt => wt.branch === 'main' || wt.branch === 'master'
  );

  const sorted = [...worktrees].sort((a, b) => {
    const priorityA = MOOD_PRIORITY[a.mood ?? 'stable'] ?? 5;
    const priorityB = MOOD_PRIORITY[b.mood ?? 'stable'] ?? 5;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    const labelA = a.branch || a.name;
    const labelB = b.branch || b.name;
    return labelA.localeCompare(labelB);
  });

  if (mainIndex >= 0) {
    const mainWorktree = worktrees[mainIndex];
    const filtered = sorted.filter(wt => wt !== mainWorktree);
    return [mainWorktree, ...filtered];
  }

  return sorted;
}

export const WorktreeOverview: React.FC<WorktreeOverviewProps> = ({
  worktrees,
  worktreeChanges,
  focusedWorktreeId,
  expandedWorktreeIds,
  onToggleExpand,
  onCopyTree,
  onOpenEditor,
}) => {
  const sorted = useMemo(() => sortWorktrees(worktrees), [worktrees]);

  return (
    <Box flexDirection="column" gap={1} flexGrow={1}>
      {sorted.map((worktree) => {
        const changes = worktreeChanges.get(worktree.id) ?? {
          ...FALLBACK_CHANGES,
          worktreeId: worktree.id,
          rootPath: worktree.path,
        };

        return (
          <WorktreeCard
            key={worktree.id}
            worktree={worktree}
            changes={changes}
            mood={worktree.mood ?? 'stable'}
            isFocused={worktree.id === focusedWorktreeId}
            isExpanded={expandedWorktreeIds.has(worktree.id)}
            onToggleExpand={() => onToggleExpand(worktree.id)}
            // Future interactive actions
            onCopyTree={() => onCopyTree(worktree.id)}
            onOpenEditor={() => onOpenEditor(worktree.id)}
          />
        );
      })}
    </Box>
  );
};
