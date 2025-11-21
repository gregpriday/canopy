import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { events } from '../services/events.js';
import type { Worktree } from '../types/index.js';
import { useTheme } from '../theme/ThemeProvider.js';

export interface WorktreePanelProps {
  /** All available worktrees */
  worktrees: Worktree[];
  /** Currently active worktree ID */
  activeWorktreeId: string | null;
  /** Optional callback when user selects a worktree */
  onSelect?: (worktreeId: string) => void;
  /** Callback to close the panel */
  onClose: () => void;
}

/**
 * WorktreePanel component - Git worktree selection overlay
 *
 * Displays all available worktrees with keyboard navigation.
 * Features:
 * - Arrow keys to navigate (with wrap-around)
 * - Enter to select and switch
 * - ESC to close without switching
 * - Visual indicators for current and selected worktrees
 * - Empty state handling
 */
export const WorktreePanel: React.FC<WorktreePanelProps> = ({
  worktrees,
  activeWorktreeId,
  onSelect,
  onClose,
}) => {
  const { palette } = useTheme();
  // Find initial cursor position (current worktree)
  const initialCursor = worktrees.findIndex(wt => wt.id === activeWorktreeId);
  const [cursor, setCursor] = useState(initialCursor >= 0 ? initialCursor : 0);
  const cursorRef = useRef(cursor);

  // Keep ref in sync so keyboard handler always has the latest index
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  // Resync cursor when activeWorktreeId changes (parent switches active worktree)
  useEffect(() => {
    const newIndex = worktrees.findIndex(wt => wt.id === activeWorktreeId);
    if (newIndex >= 0) {
      const nextCursor = newIndex;
      cursorRef.current = nextCursor;
      setCursor(nextCursor);
    }
  }, [activeWorktreeId, worktrees]);

  // Update cursor if worktrees array changes and cursor is out of bounds
  useEffect(() => {
    if (cursor >= worktrees.length && worktrees.length > 0) {
      const nextCursor = Math.max(0, worktrees.length - 1);
      cursorRef.current = nextCursor;
      setCursor(nextCursor);
    }
  }, [worktrees.length, cursor]);

  // Keyboard navigation
  useInput((input, key) => {
    if (key.upArrow) {
      // Move cursor up with wrap-around
      setCursor(prev => {
        const next = prev > 0 ? prev - 1 : Math.max(0, worktrees.length - 1);
        cursorRef.current = next;
        return next;
      });
    } else if (key.downArrow) {
      // Move cursor down with wrap-around
      setCursor(prev => {
        const next = prev < worktrees.length - 1 ? prev + 1 : 0;
        cursorRef.current = next;
        return next;
      });
    } else if (key.return) {
      // Select current worktree
      const currentIndex = cursorRef.current ?? 0;
      if (worktrees[currentIndex]) {
        events.emit('sys:worktree:switch', { worktreeId: worktrees[currentIndex].id });
        onSelect?.(worktrees[currentIndex].id);
      }
    } else if (key.escape) {
      // Close panel without selecting
      onClose();
    }
  });

  // Empty state
  if (worktrees.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={palette.chrome.border}
        paddingX={2}
        paddingY={1}
        width={60}
      >
        <Box marginBottom={1}>
          <Text bold color={palette.accent.primary}>
            Git Worktrees
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>No worktrees found</Text>
        </Box>
        <Box borderStyle="single" borderColor={palette.chrome.separator} paddingX={1}>
          <Text dimColor>ESC: Close</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={palette.chrome.border}
      paddingX={2}
      paddingY={1}
      width={60}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={palette.accent.primary}>
          Git Worktrees
        </Text>
      </Box>

      {/* Worktree list */}
      <Box flexDirection="column" marginBottom={1}>
        {worktrees.map((worktree, index) => {
          const isActive = worktree.id === activeWorktreeId;
          const isSelected = index === cursor;

          return (
            <Box key={worktree.id} paddingX={1}>
              {/* Current indicator */}
              <Text color={isActive ? palette.semantic.srcFolder : palette.text.tertiary}>
                {isActive ? '→ ' : '  '}
              </Text>

              {/* Worktree name, branch, summary, and path */}
              <Box flexDirection="column" flexGrow={1}>
                {/* First line: name and branch */}
                <Text
                  backgroundColor={isSelected ? palette.selection.background : undefined}
                  color={isSelected ? palette.selection.text : palette.text.secondary}
                >
                  {worktree.name.padEnd(15)}
                  {worktree.branch ? ` [${worktree.branch}]` : ''}
                </Text>

                {/* Second line: summary and modified count */}
                {(() => {
                  const hasModifiedFiles =
                    worktree.modifiedCount !== undefined && worktree.modifiedCount > 0;
                  const shouldShowSummaryRow =
                    worktree.summaryLoading || Boolean(worktree.summary) || hasModifiedFiles;
                  if (!shouldShowSummaryRow) {
                    return null;
                  }

                  const summaryText = worktree.summaryLoading ? '⟳ Loading...' : worktree.summary;

                  return (
                    <Box marginLeft={2}>
                      {summaryText && (
                        <Text dimColor>{summaryText}</Text>
                      )}
                      {!worktree.summaryLoading && hasModifiedFiles && (
                        <Text color={palette.git.modified}> [{worktree.modifiedCount} files]</Text>
                      )}
                    </Box>
                  );
                })()}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Footer with hints */}
      <Box borderStyle="single" borderColor={palette.chrome.separator} paddingX={1}>
        <Text dimColor>↑↓: Navigate • Enter: Switch • ESC: Close</Text>
      </Box>
    </Box>
  );
};
