import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import type { Worktree, CanopyConfig, GitStatus } from '../types/index.js';
import type { ProjectIdentity } from '../services/ai/index.js';
import { useTheme } from '../theme/ThemeProvider.js';

interface HeaderProps {
  cwd: string;
  filterActive: boolean;
  filterQuery: string;
  currentWorktree?: Worktree | null;
  worktreeCount?: number;
  activeWorktreeCount?: number;
  onWorktreeClick?: () => void;
  identity: ProjectIdentity;
  config: CanopyConfig;
  isSwitching?: boolean;
  gitOnlyMode?: boolean;
  onToggleGitOnlyMode?: () => void;
  gitEnabled?: boolean;
  gitStatus?: Map<string, GitStatus>;
}

export const Header: React.FC<HeaderProps> = ({
  filterActive,
  filterQuery,
  worktreeCount = 0,
  activeWorktreeCount = 0,
  identity,
  gitStatus = new Map(), // retained for prop compatibility
}) => {
  const { palette } = useTheme();

  const gradient = {
    start: identity.gradientStart,
    end: identity.gradientEnd,
  };

  return (
    <Box
      borderStyle="single"
      borderColor={palette.chrome.border}
      paddingX={1}
      justifyContent="space-between"
      width="100%"
    >
      <Box>
        {identity.emoji && <Text>{identity.emoji} </Text>}
        <Gradient colors={[gradient.start, gradient.end]}>
          <Text bold>{identity.title}</Text>
        </Gradient>

        {filterActive && (
          <Text>
            <Text dimColor> │ </Text>
            <Text dimColor>Filter: </Text>
            <Text color={palette.accent.primary}>{filterQuery}</Text>
          </Text>
        )}
      </Box>

      <Box>
        <Text dimColor>
          {worktreeCount} {worktreeCount === 1 ? 'worktree' : 'worktrees'}
          {activeWorktreeCount > 0 ? ` • ${activeWorktreeCount} active` : ''}
        </Text>
      </Box>
    </Box>
  );
};
