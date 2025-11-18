import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

export interface CommandBarProps {
  active: boolean;
  input: string;
  history: string[];
  onInputChange: (value: string) => void;
  onSubmit: (command: string) => void;
  onCancel: () => void;
}

/**
 * CommandBar component - Slash command input interface
 *
 * Displays at the bottom of the screen when active. Supports:
 * - Text input with live updates
 * - Command history navigation (up/down arrows)
 * - Enter to execute, ESC to cancel
 * - Visual placeholder text
 */
export const CommandBar: React.FC<CommandBarProps> = ({
  active,
  input,
  history,
  onInputChange,
  onSubmit,
  onCancel,
}) => {
  // Track position in command history (-1 = not navigating)
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Store user's draft input before entering history mode
  const [draft, setDraft] = useState('');

  // Reset history navigation when bar becomes inactive
  useEffect(() => {
    if (!active) {
      setHistoryIndex(-1);
      setDraft('');
    }
  }, [active]);

  // Clamp historyIndex if history array shrinks
  useEffect(() => {
    if (historyIndex >= history.length && history.length > 0) {
      setHistoryIndex(history.length - 1);
    } else if (historyIndex >= 0 && history.length === 0) {
      setHistoryIndex(-1);
    }
  }, [history.length, historyIndex]);

  // Handle keyboard input for history navigation and ESC
  useInput(
    (input, key) => {
      if (!active) return; // Only handle input when active

      if (key.escape) {
        onCancel();
        return;
      }

      if (key.upArrow) {
        // Navigate to older command in history
        if (history.length === 0) return;

        setHistoryIndex((prevIndex) => {
          // Save draft before entering history mode
          if (prevIndex === -1) {
            setDraft(input);
          }

          const newIndex = Math.min(prevIndex + 1, history.length - 1);
          const historyEntry = history[newIndex];

          // Guard against undefined (in case history shrinks)
          if (historyEntry !== undefined) {
            onInputChange(historyEntry);
          }
          return newIndex;
        });
        return;
      }

      if (key.downArrow) {
        setHistoryIndex((prevIndex) => {
          // Not in history mode - ignore down arrow
          if (prevIndex === -1) {
            return -1;
          }

          // At newest entry (index 0) - restore draft and exit history mode
          if (prevIndex === 0) {
            onInputChange(draft);
            setDraft('');
            return -1;
          }

          // Move to newer command
          const newIndex = prevIndex - 1;
          const historyEntry = history[newIndex];

          // Guard against undefined (in case history shrinks)
          if (historyEntry !== undefined) {
            onInputChange(historyEntry);
          }
          return newIndex;
        });
        return;
      }

      // Any other key input → user is manually editing
      if (historyIndex !== -1 && input) {
        setHistoryIndex(-1);
        setDraft('');
      }
    },
    { isActive: active }
  );

  // Handle input changes from TextInput
  const handleChange = (value: string) => {
    onInputChange(value);

    // If user is typing while in history mode, exit and discard draft
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
      setDraft('');
    }
  };

  // Handle Enter key (command submission)
  const handleSubmit = () => {
    if (input.trim()) {
      onSubmit(input);
    } else {
      // Empty input on Enter → cancel
      onCancel();
    }
  };

  // Don't render if not active
  if (!active) return null;

  return (
    <Box
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      marginTop={1}
      flexDirection="row"
    >
      <Text color="cyan" bold>
        /
      </Text>
      <Box marginLeft={1} flexGrow={1}>
        <TextInput
          value={input}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder="Type command or filter text..."
          showCursor={true}
        />
      </Box>
    </Box>
  );
};
