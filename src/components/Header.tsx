import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { relative } from 'node:path';
import type { Worktree, CanopyConfig } from '../types/index.js';
import type { ProjectIdentity } from '../services/ai/index.js';
import { useTheme } from '../theme/ThemeProvider.js';

interface HeaderProps {
  cwd: string;
  filterActive: boolean;
  filterQuery: string;
  currentWorktree?: Worktree | null;
  worktreeCount?: number;
  onWorktreeClick?: () => void;
  identity: ProjectIdentity;
  config: CanopyConfig;
  isSwitching?: boolean;
  gitOnlyMode?: boolean;
  onToggleGitOnlyMode?: () => void;
  gitEnabled?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  cwd,
  filterActive,
  filterQuery,
  currentWorktree,
  worktreeCount = 0,
  onWorktreeClick,
  identity,
  config,
  isSwitching = false,
  gitOnlyMode = false,
  onToggleGitOnlyMode,
  gitEnabled = true,
}) => {
  const { palette } = useTheme();
  // Note: Keyboard handling for worktree actions (w/W keys) is delegated to
  // the global useKeyboard hook to avoid conflicts with the global keyboard contract

  // Determine worktree display name - use branch, then name, then 'detached'
  const worktreeName = currentWorktree?.branch ?? currentWorktree?.name ?? 'detached';

  // Show worktree indicator when we have worktree data AND config allows it
  const showWorktreeIndicator = !!currentWorktree && (config.worktrees?.showInHeader ?? true);

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

  // Split path into breadcrumb segments
  const pathSegments = displayPath.split('/').filter(Boolean);
  const isRoot = displayPath === '/' || pathSegments.length === 0;

  // Truncate long branch names
  const maxBranchLength = 20;
  const truncatedBranchName = worktreeName.length > maxBranchLength
    ? worktreeName.slice(0, maxBranchLength - 1) + '…'
    : worktreeName;

  // Show git-only mode button only when git is enabled
  const showGitOnlyButton = gitEnabled && onToggleGitOnlyMode !== undefined;

  return (
    <Box borderStyle="single" borderColor={gitOnlyMode ? palette.alert.warning : undefined} paddingX={1}>
      <Text>{identity.emoji} </Text>

      {/* Dynamic Gradient and Title */}
      <Gradient colors={[identity.gradientStart, identity.gradientEnd]}>
        <Text bold>{identity.title}</Text>
      </Gradient>

      {showWorktreeIndicator && (
        <>
          <Text dimColor> • </Text>
          <Text dimColor>wt </Text>
          <Text
            color={isSwitching ? palette.alert.warning : palette.accent.primary}
            bold={onWorktreeClick !== undefined}
            underline={onWorktreeClick !== undefined}
          >
            {isSwitching ? '⟳ ' : ''}[{truncatedBranchName}]
          </Text>
          <Text dimColor> ({worktreeCount})</Text>
        </>
      )}

      <Text dimColor> • </Text>

      {/* Breadcrumb path segments */}
      {isRoot ? (
        <Text color={palette.text.secondary}>/</Text>
      ) : (
        <>
          {pathSegments.map((segment, index) => (
            <React.Fragment key={index}>
              <Text color={index === pathSegments.length - 1 ? palette.text.primary : palette.text.secondary}>
                {segment}
              </Text>
              {index < pathSegments.length - 1 && (
                <Text dimColor> / </Text>
              )}
            </React.Fragment>
          ))}
        </>
      )}

      {/* Git-only mode toggle button */}
      {showGitOnlyButton && (
        <>
          <Text dimColor> </Text>
          <Text
            color={gitOnlyMode ? palette.alert.warning : palette.accent.secondary}
            bold
            underline
          >
            [{gitOnlyMode ? 'Git' : 'All'}]
          </Text>
        </>
      )}

      {filterActive && (
        <>
          <Text dimColor> [</Text>
          <Text color={palette.alert.warning}>*</Text>
          <Text dimColor>] </Text>
          <Text color={palette.accent.primary}>{filterQuery}</Text>
        </>
      )}
    </Box>
  );
};
