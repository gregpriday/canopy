import React, { useState, useCallback, useLayoutEffect } from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { measureElement } from 'ink';
import type { Worktree, CanopyConfig, GitStatus } from '../types/index.js';
import type { ProjectIdentity } from '../services/ai/index.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { useTerminalMouse } from '../hooks/useTerminalMouse.js';
import { useRepositoryStats } from '../hooks/useRepositoryStats.js';
import { openGitHubUrl } from '../utils/github.js';

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
  onOpenGitFox?: () => void;
  onOpenGitHub?: () => void;
}

const HeaderButton: React.FC<{
  id: string;
  label: string;
  color?: string;
  dimColor?: boolean;
  onPress?: () => void;
  registerRegion?: (
    id: string,
    bounds?: { x: number; y: number; width: number; height: number },
    handler?: () => void
  ) => void;
}> = ({ id, label, color, dimColor, onPress, registerRegion }) => {
  const ref = React.useRef<import('ink').DOMElement | null>(null);
  const [isPressed, setIsPressed] = useState(false);
  const { palette } = useTheme();

  // Wrapper to handle visual flash + action
  const handlePress = useCallback(() => {
    if (isPressed || !onPress) return;

    setIsPressed(true);
    onPress();

    setTimeout(() => {
      setIsPressed(false);
    }, 150);
  }, [onPress, isPressed]);

  useLayoutEffect(() => {
    if (!registerRegion || !ref.current || !onPress) {
      return;
    }

    const measured = measureElement(ref.current) as {
      width: number;
      height: number;
    };
    const yogaNode = ref.current.yogaNode;
    if (!yogaNode) {
      return;
    }

    const getAbsolutePosition = (node: any): { x: number; y: number } => {
      let x = 0;
      let y = 0;
      let current = node;
      while (current) {
        x += current.getComputedLeft?.() ?? 0;
        y += current.getComputedTop?.() ?? 0;
        current = current.getParent?.();
      }
      return { x, y };
    };

    const { x, y } = getAbsolutePosition(yogaNode);
    const bounds = { x, y, width: measured.width, height: measured.height };

    registerRegion(id, bounds, handlePress);

    return () => registerRegion(id, undefined, handlePress);
  }, [registerRegion, id, onPress, handlePress]);

  return (
    <Box
      ref={ref}
      backgroundColor={isPressed ? 'white' : undefined}
      // @ts-ignore
      onClick={handlePress}
    >
      <Text
        color={isPressed ? 'black' : (color || palette.text.secondary)}
        dimColor={!isPressed && dimColor}
      >
        {label}
      </Text>
    </Box>
  );
};

export const Header: React.FC<HeaderProps> = ({
  cwd,
  filterActive,
  filterQuery,
  identity,
  onOpenGitFox,
}) => {
  const { palette } = useTheme();
  const stats = useRepositoryStats(cwd);

  const gradient = {
    start: identity.gradientStart,
    end: identity.gradientEnd,
  };

  const clickRegionsRef = React.useRef(
    new Map<
      string,
      { bounds: { x: number; y: number; width: number; height: number }; handler: () => void }
    >()
  );

  const registerClickRegion = React.useCallback((
    id: string,
    bounds?: { x: number; y: number; width: number; height: number },
    handler?: () => void
  ) => {
    if (!bounds || !handler) {
      clickRegionsRef.current.delete(id);
      return;
    }
    clickRegionsRef.current.set(id, { bounds, handler });
  }, []);

  useTerminalMouse({
    enabled: true,
    onMouse: event => {
      if (event.button !== 'left' || event.action !== 'down') {
        return;
      }

      for (const { bounds, handler } of clickRegionsRef.current.values()) {
        const withinX = event.x >= bounds.x && event.x < bounds.x + bounds.width;
        const withinY = event.y >= bounds.y && event.y < bounds.y + bounds.height;
        if (withinX && withinY) {
          handler();
          break;
        }
      }
    },
  });

  // Handlers for different click actions
  const handleOpenIssues = useCallback(() => openGitHubUrl(cwd, 'issues'), [cwd]);
  const handleOpenPRs = useCallback(() => openGitHubUrl(cwd, 'pulls'), [cwd]);

  return (
    <Box
      borderStyle="single"
      borderColor={palette.chrome.border}
      paddingX={1}
      justifyContent="space-between"
      width="100%"
    >
      {/* Left side: Project Identity & Filter */}
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

      {/* Right side: Stats Bar (no gaps) */}
      <Box>
        {/* GitFox / Commits */}
        {stats.commitCount > 0 && (
          <HeaderButton
            id="header-commits"
            label={`[${stats.commitCount} commits]`}
            color={palette.text.secondary}
            dimColor={true}
            onPress={onOpenGitFox}
            registerRegion={registerClickRegion}
          />
        )}

        {/* GitHub Stats */}
        {stats.issueCount !== null && (
          <HeaderButton
            id="header-issues"
            label={`[${stats.issueCount} issues]`}
            color={palette.text.secondary}
            dimColor={true}
            onPress={handleOpenIssues}
            registerRegion={registerClickRegion}
          />
        )}

        {stats.prCount !== null && (
          <HeaderButton
            id="header-prs"
            label={`[${stats.prCount} PRs]`}
            color={palette.text.secondary}
            dimColor={true}
            onPress={handleOpenPRs}
            registerRegion={registerClickRegion}
          />
        )}

        {/* Loading indicator or fallback if gh CLI not found */}
        {stats.loading && (
          <Text dimColor>(loading...)</Text>
        )}
        {!stats.loading && stats.issueCount === null && stats.prCount === null && (
          <Text dimColor>(gh CLI unavailable)</Text>
        )}
      </Box>
    </Box>
  );
};
