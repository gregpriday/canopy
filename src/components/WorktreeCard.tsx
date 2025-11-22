import React from 'react';
import { Box, Text } from 'ink';
import type { Worktree, WorktreeChanges, WorktreeMood } from '../types/index.js';
import { GitIndicator } from '../utils/gitIndicators.js';
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
}

const MAX_VISIBLE_CHANGES = 10;

export const WorktreeCard: React.FC<WorktreeCardProps> = ({
  worktree,
  changes,
  mood,
  isFocused,
  isExpanded,
  onToggleExpand,
  onCopyTree,
  onOpenEditor,
}) => {
  const { palette } = useTheme();
  const showCopyTreeHint = Boolean(onCopyTree);
  const showOpenEditorHint = Boolean(onOpenEditor);
  const hasToggleHandler = typeof onToggleExpand === 'function';

  const borderColor = getBorderColorForMood(mood);
  const borderStyle = isFocused ? 'double' : 'round';
  const headerColor = mood === 'active' ? palette.git.modified : palette.text.primary;
  const visibleChanges = isExpanded ? changes.changes.slice(0, MAX_VISIBLE_CHANGES) : [];
  const remainingCount = isExpanded
    ? Math.max(0, changes.changes.length - visibleChanges.length)
    : 0;

  const fileCountLabel =
    changes.changedFileCount === 1
      ? '1 file'
      : `${changes.changedFileCount} files`;

  const summaryText = worktree.summary ?? 'No summary yet';

  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle}
      borderColor={borderColor}
      paddingX={1}
      paddingY={1}
      marginBottom={1}
    >
      <Box flexDirection="column">
        <Box>
          <Text bold color={headerColor}>
            {worktree.branch ?? worktree.name}
          </Text>
          {!worktree.branch && (
            <Text color={palette.alert.warning}> (detached)</Text>
          )}
        </Box>

        <Box justifyContent="space-between">
          <Text color={palette.text.secondary} dimColor={!worktree.summary}>
            {summaryText}
          </Text>
          <Text color={palette.text.tertiary}>{fileCountLabel}</Text>
        </Box>
      </Box>

      {isExpanded && (
        <Box flexDirection="column" marginTop={1}>
          {visibleChanges.map(change => (
            <Box key={`${change.path}-${change.status}`}>
              <GitIndicator status={change.status} />
              <Text> {change.path}</Text>
            </Box>
          ))}
          {remainingCount > 0 && (
            <Text dimColor>...and {remainingCount} more</Text>
          )}
        </Box>
      )}

      {isFocused && (
        <Box marginTop={1}>
          <Text dimColor>
            {hasToggleHandler && (
              <>
                <Text color={palette.accent.primary}>[space]</Text> Expand{'  '}
              </>
            )}
            {showCopyTreeHint && (
              <>
                <Text color={palette.accent.primary}>[c]</Text> Copy Context{'  '}
              </>
            )}
            <Text color={palette.accent.primary}>[p]</Text> Profile{'  '}
            {showOpenEditorHint && (
              <>
                <Text color={palette.accent.primary}>[Enter]</Text> Editor
              </>
            )}
          </Text>
        </Box>
      )}
    </Box>
  );
};
