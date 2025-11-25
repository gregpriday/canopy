import React, { useLayoutEffect, useMemo, useState, useCallback } from 'react';
import { Box, Text, measureElement } from 'ink';
import path from 'node:path';
import { homedir } from 'node:os';
import type { FileChangeDetail, GitStatus, Worktree, WorktreeChanges, WorktreeMood } from '../types/index.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { ActivityTrafficLight } from './ActivityTrafficLight.js';

/**
 * Get OS-specific file manager label
 * @returns Label for the current platform's file manager
 */
export function getExplorerLabel(): string {
  const platform = process.platform;
  if (platform === 'darwin') return 'Finder';
  if (platform === 'win32') return 'Explorer';
  return 'Folder'; // Linux/Unix fallback
}

export interface WorktreeCardProps {
  worktree: Worktree;
  changes: WorktreeChanges;
  mood: WorktreeMood;
  trafficLight: 'green' | 'yellow' | 'gray';
  isFocused: boolean;
  isExpanded: boolean;
  activeRootPath: string;
  onToggleExpand: () => void;
  onCopyTree?: () => void;
  onOpenEditor?: () => void;
  onOpenExplorer?: () => void;
  registerClickRegion?: (
    id: string,
    bounds?: { x: number; y: number; width: number; height: number },
    handler?: () => void
  ) => void;
}

const MAX_VISIBLE_CHANGES = 10;

const STATUS_PRIORITY: Record<GitStatus, number> = {
  modified: 0,
  added: 1,
  deleted: 2,
  renamed: 3,
  untracked: 4,
  ignored: 5,
};

const STATUS_GLYPHS: Record<GitStatus, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: '?',
  ignored: '·',
};

function truncateMiddle(value: string, maxLength = 42): string {
  if (value.length <= maxLength) return value;
  const half = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, half)}...${value.slice(-half)}`;
}

function formatRelativePath(targetPath: string, rootPath: string): string {
  try {
    const home = homedir();
    let displayPath = path.isAbsolute(targetPath)
      ? path.relative(rootPath, targetPath)
      : targetPath;

    if (!displayPath) {
      displayPath = path.basename(targetPath);
    }

    if (displayPath.startsWith(home)) {
      displayPath = displayPath.replace(home, '~');
    }

    return displayPath;
  } catch {
    return targetPath;
  }
}

// PERF: Memoized to prevent re-renders when other files in the list change
const FileChangeRow = React.memo<{
  change: FileChangeDetail;
  rootPath: string;
  accentColors: {
    added: string;
    deleted: string;
    modified: string;
    muted: string;
  };
}>(({ change, rootPath, accentColors }) => {
  const additionsLabel =
    change.insertions === null ? '---' : `+${change.insertions}`;
  const deletionsLabel =
    change.deletions === null ? '---' : `-${change.deletions}`;

  const statusColor =
    change.status === 'added'
      ? accentColors.added
      : change.status === 'deleted'
      ? accentColors.deleted
      : change.status === 'untracked' || change.status === 'ignored'
      ? accentColors.muted
      : accentColors.modified;

  const relativePath = formatRelativePath(change.path, rootPath);
  const displayPath = truncateMiddle(relativePath, 46);

  return (
    <Box justifyContent="space-between">
      <Box>
        <Text color={statusColor}>{STATUS_GLYPHS[change.status] ?? '?'} </Text>
        <Text>{displayPath}</Text>
      </Box>
      <Box gap={2}>
        <Text color={accentColors.added}>{additionsLabel}</Text>
        <Text color={accentColors.deleted}>{deletionsLabel}</Text>
      </Box>
    </Box>
  );
});

const ActionButton: React.FC<{
  id: string;
  label: string;
  color: string;
  onPress?: () => void;
  registerRegion?: (
    id: string,
    bounds?: { x: number; y: number; width: number; height: number },
    handler?: () => void
  ) => void;
}> = ({ id, label, color, onPress, registerRegion }) => {
  const ref = React.useRef<import('ink').DOMElement | null>(null);
  const [isPressed, setIsPressed] = useState(false);

  // Wrapper to handle visual flash + action
  const handlePress = useCallback(() => {
    if (isPressed) return;

    setIsPressed(true);
    onPress?.();

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
  }, [registerRegion, id, label, color, onPress, handlePress]);

  return (
    <Box
      ref={ref}
      backgroundColor={isPressed ? 'white' : undefined}
      // @ts-ignore
      onClick={handlePress}
    >
      <Text color={isPressed ? 'black' : color} bold>
        [{label}]
      </Text>
    </Box>
  );
};

// PERF: Wrapped in React.memo to prevent unnecessary re-renders when parent state changes
// but this card's props haven't changed (e.g., notification state changes in App.tsx)
const WorktreeCardInner: React.FC<WorktreeCardProps> = ({
  worktree,
  changes,
  mood,
  trafficLight,
  isFocused,
  isExpanded,
  activeRootPath,
  onToggleExpand,
  onCopyTree,
  onOpenEditor,
  onOpenExplorer,
  registerClickRegion,
}) => {
  const { palette } = useTheme();

  // Memoize explorer label for performance
  const explorerLabel = useMemo(() => getExplorerLabel(), []);

  // Use consistent border color that works in dark mode
  // Traffic light is displayed separately via the indicator dot
  const borderColor = palette.text.tertiary; // Medium gray (#808080) - visible but not too prominent

  const borderStyle = isFocused ? 'double' : 'round';
  const headerColor = mood === 'active' ? palette.git.modified : palette.text.primary;

  const sortedChanges = useMemo(() => {
    return [...changes.changes].sort((a, b) => {
      const priorityA = STATUS_PRIORITY[a.status] ?? 99;
      const priorityB = STATUS_PRIORITY[b.status] ?? 99;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const churnA = (a.insertions ?? 0) + (a.deletions ?? 0);
      const churnB = (b.insertions ?? 0) + (b.deletions ?? 0);
      if (churnA !== churnB) {
        return churnB - churnA;
      }

      return a.path.localeCompare(b.path);
    });
  }, [changes.changes]);

  const visibleChanges = isExpanded ? sortedChanges.slice(0, MAX_VISIBLE_CHANGES) : [];
  const remainingCount = isExpanded
    ? Math.max(0, sortedChanges.length - visibleChanges.length)
    : 0;

  const fileCountLabel = `${changes.changedFileCount} ${
    changes.changedFileCount === 1 ? 'file' : 'files'
  }`;

  const totalInsertions =
    changes.totalInsertions ??
    changes.insertions ??
    changes.changes.reduce((sum, change) => sum + (change.insertions ?? 0), 0);
  const totalDeletions =
    changes.totalDeletions ??
    changes.deletions ??
    changes.changes.reduce((sum, change) => sum + (change.deletions ?? 0), 0);

  const hasChanges = changes.changedFileCount > 0;
  let SummaryComponent: React.ReactNode;

  // Detect if summary is a commit message (starts with ✅)
  const isCommitMessage = worktree.summary?.startsWith('✅');

  if (worktree.summary) {
    if (isCommitMessage) {
      // Case A: Last Commit (always show with prefix, even during dirty state)
      SummaryComponent = (
        <Text color={palette.text.tertiary}>
          <Text bold>Last commit: </Text>
          {worktree.summary}
        </Text>
      );
    } else if (hasChanges) {
      // Case B: AI Summary (Active changes)
      SummaryComponent = (
        <Text color={palette.text.secondary}>
          {worktree.summary}
        </Text>
      );
    } else {
      // Case C: Clean state without commit message
      SummaryComponent = (
        <Text color={palette.text.tertiary}>
          {worktree.summary}
        </Text>
      );
    }
  } else if (worktree.summaryLoading) {
    SummaryComponent = (
      <Text color={palette.text.tertiary}>
        Generating summary...
      </Text>
    );
  } else {
    // Fallback for edge cases (initialization, etc.)
    // Per spec: "No active changes" should NEVER appear
    const fallbackText = worktree.branch
      ? `Clean: ${worktree.branch}`
      : 'Ready';
    SummaryComponent = (
      <Text color={palette.text.tertiary}>
        {fallbackText}
      </Text>
    );
  }

  const accentColors = {
    added: palette.git.added,
    deleted: palette.git.deleted,
    modified: palette.git.modified,
    muted: palette.text.tertiary,
  };
  const branchLabel = worktree.branch ?? worktree.name;
  const isActive = worktree.isCurrent;
  const isPrimaryWorktree = worktree.branch === 'main' || worktree.branch === 'master';
  const relativeWorktreePath = path.relative(activeRootPath, worktree.path) || '.';
  const locationLabel = isPrimaryWorktree
    ? worktree.path
    : truncateMiddle(relativeWorktreePath, 50);

  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle}
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
      marginBottom={0}
    >
      {/* Row 1: Identity (Branch | Path) */}
      <Box justifyContent="space-between" alignItems="center" marginBottom={0}>
        <Box>
          <Text bold color={headerColor}>
            {isActive && <Text color={palette.accent.primary}>● </Text>}
            {branchLabel}
          </Text>
          {!worktree.branch && (
            <Text color={palette.alert.warning}> (detached)</Text>
          )}
        </Box>
        <Box>
          <Text color={palette.text.tertiary}>
            {locationLabel}
          </Text>
        </Box>
      </Box>

      {/* Row 2: Statistics Bar with Traffic Light */}
      <Box marginTop={0} marginBottom={0}>
        <Text>
          <ActivityTrafficLight timestamp={worktree.lastActivityTimestamp} />
          <Text> </Text>
          <Text color={palette.text.secondary}>{fileCountLabel}</Text>
          <Text dimColor> • </Text>
          <Text color={palette.git.added}>+{totalInsertions}</Text>
          <Text dimColor> • </Text>
          <Text color={palette.git.deleted}>-{totalDeletions}</Text>
        </Text>
      </Box>

      {/* Row 3: AI Summary */}
      <Box marginTop={1}>
        {SummaryComponent}
      </Box>

      {/* Row 4: Expansion (File List) */}
      {isExpanded && (
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="single"
          borderColor={palette.chrome.separator}
        >
          {visibleChanges.map(change => (
            <FileChangeRow
              key={`${change.path}-${change.status}`}
              change={change}
              rootPath={changes.rootPath}
              accentColors={accentColors}
            />
          ))}
          {remainingCount > 0 && (
            <Text dimColor>...and {remainingCount} more</Text>
          )}
        </Box>
      )}

      <Box marginTop={1} justifyContent="space-between" alignItems="center">
        <ActionButton
          id={`${worktree.id}-expand`}
          label={isExpanded ? 'Collapse' : 'Expand'}
          color={palette.text.secondary}
          onPress={onToggleExpand}
          registerRegion={registerClickRegion}
        />
        <Box gap={1}>
          <ActionButton
            id={`${worktree.id}-copytree`}
            label="CopyTree"
            color={palette.text.secondary}
            onPress={onCopyTree}
            registerRegion={registerClickRegion}
          />
          <ActionButton
            id={`${worktree.id}-vscode`}
            label="VS Code"
            color={palette.text.secondary}
            onPress={onOpenEditor}
            registerRegion={registerClickRegion}
          />
          <ActionButton
            id={`${worktree.id}-explorer`}
            label={explorerLabel}
            color={palette.text.secondary}
            onPress={onOpenExplorer}
            registerRegion={registerClickRegion}
          />
        </Box>
      </Box>
    </Box>
  );
};

// PERF: Export memoized component with custom comparison to prevent unnecessary re-renders
export const WorktreeCard = React.memo(WorktreeCardInner, (prevProps, nextProps) => {
  // Shallow compare scalar props
  if (prevProps.isFocused !== nextProps.isFocused) return false;
  if (prevProps.isExpanded !== nextProps.isExpanded) return false;
  if (prevProps.mood !== nextProps.mood) return false;
  if (prevProps.trafficLight !== nextProps.trafficLight) return false;
  if (prevProps.activeRootPath !== nextProps.activeRootPath) return false;

  // Compare worktree identity and content
  const prevWt = prevProps.worktree;
  const nextWt = nextProps.worktree;
  if (prevWt.id !== nextWt.id) return false;
  if (prevWt.summary !== nextWt.summary) return false;
  if (prevWt.summaryLoading !== nextWt.summaryLoading) return false;
  if (prevWt.modifiedCount !== nextWt.modifiedCount) return false;

  // Compare changes (check count and latest mtime for quick equality)
  const prevChanges = prevProps.changes;
  const nextChanges = nextProps.changes;
  if (prevChanges.changedFileCount !== nextChanges.changedFileCount) return false;
  if (prevChanges.latestFileMtime !== nextChanges.latestFileMtime) return false;
  if (prevChanges.totalInsertions !== nextChanges.totalInsertions) return false;
  if (prevChanges.totalDeletions !== nextChanges.totalDeletions) return false;

  // Callbacks are stable (created with useCallback in parent)
  return true;
});
