import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme/ThemeProvider.js';

export interface NoteDockProps {
  /** AI note content (undefined if file doesn't exist) */
  noteContent?: string;
}

/**
 * NoteDock displays AI agent status notes from .canopy_note.txt.
 * Only renders when content exists; returns null otherwise.
 * Follows the same visual pattern as ServerDock.
 */
export const NoteDock: React.FC<NoteDockProps> = ({ noteContent }) => {
  const { palette } = useTheme();

  // Don't render if no note content
  if (!noteContent) {
    return null;
  }

  return (
    <Box
      marginTop={1}
      paddingX={0}
      borderStyle="single"
      borderTop={true}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor={palette.chrome.separator}
    >
      <Box gap={1}>
        <Text color={palette.accent.primary}>📝</Text>
        <Text color={palette.text.secondary}>{noteContent}</Text>
      </Box>
    </Box>
  );
};
