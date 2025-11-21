import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ActivityEvent } from '../types/index.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { formatRelativeTime } from '../utils/time.js';

export interface RecentActivityPanelProps {
  /** Whether the panel is visible */
  visible: boolean;
  /** Array of activity events to display (newest first) */
  events: ActivityEvent[];
  /** Callback when the user closes the panel */
  onClose: () => void;
  /** Callback when the user selects a file path */
  onSelectPath: (path: string) => void;
}

/**
 * Get the icon and color for an activity event type.
 */
function getEventIcon(type: ActivityEvent['type']): { icon: string; color: string } {
  switch (type) {
    case 'add':
    case 'addDir':
      return { icon: '+', color: 'green' };
    case 'change':
      return { icon: '~', color: 'yellow' };
    case 'unlink':
    case 'unlinkDir':
      return { icon: 'D', color: 'red' };
  }
}

/**
 * Truncate a path to fit within a maximum length.
 * Shows start and end of the path with ellipsis in the middle.
 */
function truncatePath(path: string, maxLength: number = 40): string {
  if (path.length <= maxLength) {
    return path;
  }

  const parts = path.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) {
    // Can't truncate much, just clip the end
    return '...' + path.slice(-(maxLength - 3));
  }

  const filename = parts[parts.length - 1];
  const firstDir = parts[0];
  const available = maxLength - filename.length - firstDir.length - 5; // 5 for "/.../"

  if (available < 0) {
    // Very long filename, just truncate
    return '...' + path.slice(-(maxLength - 3));
  }

  return `${firstDir}/.../${filename}`;
}

/**
 * RecentActivityPanel displays a modal overlay with recent file changes.
 *
 * Features:
 * - Scrollable list with keyboard navigation (↑/↓)
 * - Event type indicators (+, ~, D) with colors
 * - Relative timestamps (4s ago, 2m ago, etc.)
 * - Path truncation for narrow terminals
 * - Selection highlighting
 * - Empty state message
 *
 * Keyboard shortcuts:
 * - ↑/↓: Navigate through events
 * - Enter: Select path and close panel
 * - ESC/q: Close panel without action
 */
export function RecentActivityPanel({
  visible,
  events,
  onClose,
  onSelectPath,
}: RecentActivityPanelProps) {
  const { palette } = useTheme();
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(cursor);

  // Keep ref in sync for keyboard handler
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  // Clamp cursor when events array changes
  useEffect(() => {
    if (events.length > 0 && cursor >= events.length) {
      const nextCursor = Math.max(0, events.length - 1);
      cursorRef.current = nextCursor;
      setCursor(nextCursor);
    }
  }, [events.length, cursor]);

  // Keyboard navigation (only active when visible)
  useInput(
    (input, key) => {
      if (key.upArrow) {
        // Move cursor up with wrap-around
        setCursor(prev => {
          const next = prev > 0 ? prev - 1 : Math.max(0, events.length - 1);
          cursorRef.current = next;
          return next;
        });
      } else if (key.downArrow) {
        // Move cursor down with wrap-around
        setCursor(prev => {
          const next = prev < events.length - 1 ? prev + 1 : 0;
          cursorRef.current = next;
          return next;
        });
      } else if (key.return) {
        // Select current event
        const currentIndex = cursorRef.current ?? 0;
        if (events[currentIndex]) {
          onSelectPath(events[currentIndex].path);
        }
      } else if (key.escape || input === 'q') {
        // Close panel without selecting
        onClose();
      }
    },
    { isActive: visible },
  );

  // Don't render if not visible
  if (!visible) {
    return null;
  }

  // Empty state
  if (events.length === 0) {
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
            Recent Activity
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>No recent activity</Text>
        </Box>
        <Box borderStyle="single" borderColor={palette.chrome.separator} paddingX={1}>
          <Text dimColor>ESC/q: Close</Text>
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
          Recent Activity (last 10 minutes)
        </Text>
      </Box>

      {/* Event list */}
      <Box flexDirection="column" marginBottom={1}>
        {events.map((event, index) => {
          const isSelected = index === cursor;
          const { icon, color } = getEventIcon(event.type);
          const truncatedPath = truncatePath(event.path, 40);
          const relativeTime = formatRelativeTime(event.timestamp);

          return (
            <Box key={`${event.path}-${event.timestamp}`}>
              {/* Event type icon */}
              <Text color={color}>{icon} </Text>

              {/* File path - highlighted if selected */}
              <Box flexGrow={1}>
                <Text
                  backgroundColor={isSelected ? palette.selection.background : undefined}
                  color={isSelected ? palette.selection.text : palette.text.secondary}
                >
                  {truncatedPath.padEnd(42)}
                </Text>
              </Box>

              {/* Relative timestamp */}
              <Text dimColor>{relativeTime.padStart(8)}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Footer with keyboard hints */}
      <Box borderStyle="single" borderColor={palette.chrome.separator} paddingX={1}>
        <Text dimColor>↑↓: Navigate • Enter: Jump • ESC/q: Close</Text>
      </Box>
    </Box>
  );
}
