import React, { useLayoutEffect, useMemo } from 'react';
import { Box, Text, measureElement } from 'ink';
import path from 'node:path';
import type { FileChangeDetail, GitStatus, Worktree, WorktreeChanges, WorktreeMood } from '../types/index.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { getBorderColorForMood } from '../utils/moodColors.js';

export interface WorktreeCardProps {
  worktree: Worktree;
  changes: WorktreeChanges;
  mood: WorktreeMood;
  isFocused: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCopyTree?: () => void;
  onOpenEditor?: () => void;
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
    const relativePath = path.isAbsolute(targetPath)
      ? path.relative(rootPath, targetPath)
      : targetPath;
    return relativePath || path.basename(targetPath);
  } catch {
    return targetPath;
  }
}

const FileChangeRow: React.FC<{
  change: FileChangeDetail;
  rootPath: string;
  accentColors: {
    added: string;
    deleted: string;
    modified: string;
    muted: string;
  };
}> = ({ change, rootPath, accentColors }) => {
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
};

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

  // Map terminal mouse coordinates to this button's region using measured layout.
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

    registerRegion(id, bounds, onPress);

    return () => registerRegion(id, undefined, onPress);
    // Re-run when layout-affecting inputs change
  }, [registerRegion, id, label, color, onPress]);

  return (
    <Box
      ref={ref}
      borderStyle="single"
      borderColor={color}
      paddingX={1}
      // @ts-ignore Ink runtime may support onClick even if types don't expose it
      onClick={onPress}
    >
      <Text color={color} bold>
        {label}
      </Text>
    </Box>
  );
};

export const WorktreeCard: React.FC<WorktreeCardProps> = ({
  worktree,
  changes,
  mood,
  isFocused,
  isExpanded,
  onToggleExpand,
  onCopyTree,
  onOpenEditor,
  registerClickRegion,
}) => {
  const { palette } = useTheme();

  const borderColor = getBorderColorForMood(mood);
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

  const fileCountLabel =
    changes.changedFileCount === 1
      ? '1 file'
      : `${changes.changedFileCount} files`;

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

  if (worktree.summary && hasChanges) {
    SummaryComponent = (
      <Text color={palette.text.secondary}>
        {worktree.summaryLoading ? '⟳ ' : '🤖 '}
        {worktree.summary}
      </Text>
    );
  } else if (worktree.summaryLoading) {
    SummaryComponent = (
      <Text color={palette.text.tertiary}>
        Generating summary...
      </Text>
    );
  } else if (hasChanges) {
    SummaryComponent = (
      <Text color={palette.text.tertiary}>
        No summary available
      </Text>
    );
  } else {
    SummaryComponent = (
      <Text color={palette.text.tertiary}>
        No active changes
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
  const locationLabel = truncateMiddle(worktree.path, 54);
  const isActive = worktree.isCurrent;

  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle}
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
      marginBottom={1}
    >
      <Box justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Text bold color={headerColor}>
            {branchLabel}
          </Text>
          <Text dimColor> • </Text>
          <Text color={palette.text.secondary}>{locationLabel}</Text>
          {isActive && (
            <>
              <Text dimColor> </Text>
              <Text color={palette.accent.primary}>[ACTIVE]</Text>
            </>
          )}
          {!worktree.branch && (
            <Text color={palette.alert.warning}> (detached)</Text>
          )}
        </Box>
        <Text color={palette.text.tertiary}>{fileCountLabel}</Text>
      </Box>

      <Box justifyContent="space-between" marginTop={1}>
        {SummaryComponent}
        <Box gap={1}>
          <Text>📊</Text>
          <Text color={palette.git.added}>+{totalInsertions}</Text>
          <Text color={palette.git.deleted}>-{totalDeletions}</Text>
        </Box>
      </Box>

      {isExpanded && (
        <Box flexDirection="column" marginTop={1}>
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

      <Box marginTop={1} gap={1}>
        <ActionButton
          id={`${worktree.id}-copytree`}
          label="CopyTree"
          color={palette.accent.primary}
          onPress={onCopyTree}
          registerRegion={registerClickRegion}
        />
        <ActionButton
          id={`${worktree.id}-vscode`}
          label="VS Code"
          color={palette.accent.secondary}
          onPress={onOpenEditor}
          registerRegion={registerClickRegion}
        />
        <ActionButton
          id={`${worktree.id}-expand`}
          label={isExpanded ? 'Collapse' : 'Expand'}
          color={palette.text.secondary}
          onPress={onToggleExpand}
          registerRegion={registerClickRegion}
        />
      </Box>
    </Box>
  );
};
