import React from 'react';
import { Box, Text } from 'ink';
import { relative } from 'node:path';
import type { Worktree } from '../types/index.js';

interface HeaderProps {
  cwd: string;
  filterActive: boolean;
  filterQuery: string;
  currentWorktree?: Worktree | null;
  worktreeCount?: number;
  onWorktreeClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  cwd,
  filterActive,
  filterQuery,
  currentWorktree,
  worktreeCount = 0,
  onWorktreeClick,
}) => {
  // Note: Keyboard handling for worktree actions (w/W keys) is delegated to
  // the global useKeyboard hook to avoid conflicts with the global keyboard contract

  // Determine worktree display name - use branch, then name, then 'detached'
  const worktreeName = currentWorktree?.branch ?? currentWorktree?.name ?? 'detached';

  // Show worktree indicator when we have worktree data
  const showWorktreeIndicator = !!currentWorktree;

  // Format relative path (show cwd relative to worktree root if possible)
  const displayPath = currentWorktree
    ? (() => {
        const rel = relative(currentWorktree.path, cwd);
        // If cwd is the worktree root, relative returns '.'
        if (rel === '.') return '/';
        // If cwd is outside worktree, relative returns '..' path - use absolute
        if (rel.startsWith('..')) return cwd;
        // Otherwise, prepend '/' to make it clear it's relative to root
        return `/${rel}`;
      })()
    : cwd;

  // Truncate long branch names
  const maxBranchLength = 20;
  const truncatedBranchName = worktreeName.length > maxBranchLength
    ? worktreeName.slice(0, maxBranchLength - 1) + '…'
    : worktreeName;

  return (
    <Box borderStyle="single" paddingX={1}>
      <Text bold>Yellowwood</Text>

      {showWorktreeIndicator && (
        <>
          <Text dimColor> • </Text>
          <Text dimColor>wt </Text>
          <Text
            color="cyan"
            bold={onWorktreeClick !== undefined}
            underline={onWorktreeClick !== undefined}
          >
            [{truncatedBranchName}]
          </Text>
          <Text dimColor> ({worktreeCount})</Text>
        </>
      )}

      <Text dimColor> • </Text>
      <Text>{displayPath}</Text>

      {filterActive && (
        <>
          <Text dimColor> [</Text>
          <Text color="yellow">*</Text>
          <Text dimColor>] </Text>
          <Text color="cyan">{filterQuery}</Text>
        </>
      )}
    </Box>
  );
};
