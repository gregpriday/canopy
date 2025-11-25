import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../theme/ThemeProvider.js';
import type { SlashCommand } from '../hooks/useQuickLinks.js';
import { fuzzyMatch } from '../utils/fuzzyMatch.js';

const MAX_VISIBLE_COMMANDS = 10;

interface CommandPaletteProps {
  visible: boolean;
  commands: SlashCommand[];
  onExecute: (command: SlashCommand) => void;
  onClose: () => void;
}

export function CommandPalette({
  visible,
  commands,
  onExecute,
  onClose,
}: CommandPaletteProps): React.JSX.Element | null {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter and sort commands based on query
  const filteredCommands = useMemo(() => {
    if (!query) {
      // Show all commands sorted alphabetically when no query
      return [...commands].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Filter commands using fuzzy matching on both name and label
    const scored: Array<{ command: SlashCommand; score: number }> = [];

    for (const command of commands) {
      // Try matching against command name (primary)
      const nameMatch = fuzzyMatch(query, command.name);
      // Try matching against label (secondary)
      const labelMatch = fuzzyMatch(query, command.label.toLowerCase());

      // Take the best match score
      const score = Math.max(nameMatch?.score ?? -1, labelMatch?.score ?? -1);

      if (score >= 0) {
        scored.push({ command, score });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.command);
  }, [commands, query]);

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!visible) return;

      // Close modal on Escape
      if (key.escape) {
        onClose();
        return;
      }

      // Navigate results with up/down arrows
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex(prev => Math.min(filteredCommands.length - 1, prev + 1));
        return;
      }

      // Execute selected command on Enter
      if (key.return && filteredCommands.length > 0) {
        const selected = filteredCommands[selectedIndex];
        if (selected) {
          onExecute(selected);
          setQuery(''); // Reset query for next time
        }
        return;
      }

      // Tab: autocomplete to selected command
      if (key.tab && filteredCommands.length > 0) {
        const selected = filteredCommands[selectedIndex];
        if (selected) {
          setQuery(selected.name);
          setSelectedIndex(0); // Reset selection after autocomplete
        }
        return;
      }

      // Backspace: remove last character from query
      if (key.backspace || key.delete) {
        setQuery(prev => prev.slice(0, -1));
        setSelectedIndex(0);
        return;
      }

      // Regular character input: add to query
      if (input && !key.ctrl && !key.meta && input.length === 1) {
        setQuery(prev => prev + input);
        setSelectedIndex(0);
      }
    },
    { isActive: visible }
  );

  // Reset state when modal becomes visible
  React.useEffect(() => {
    if (visible) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [visible]);

  // Don't render if not visible
  if (!visible) return null;

  // Show message if no commands configured
  if (commands.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={palette.chrome.border}
        padding={1}
        width={60}
        marginX={2}
      >
        <Box marginBottom={1}>
          <Text bold color={palette.accent.primary}>
            /
          </Text>
          <Text color={palette.text.secondary}> No quick links configured</Text>
        </Box>
        <Box>
          <Text color={palette.text.secondary}>
            Add quickLinks to your config file to enable slash commands.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={palette.text.secondary}>[Esc] Close</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={palette.chrome.border}
      padding={1}
      width={60}
      marginX={2}
    >
      {/* Header with search input */}
      <Box marginBottom={1}>
        <Text bold color={palette.accent.primary}>
          /
        </Text>
        <Text color={palette.text.primary}>{query}</Text>
        <Text color={palette.text.secondary}>
          {query ? '' : ' Type to search commands...'}
        </Text>
      </Box>

      {/* Commands list */}
      <Box flexDirection="column" marginBottom={1}>
        {filteredCommands.length === 0 && query && (
          <Text color={palette.text.secondary}>No matching commands</Text>
        )}
        {(() => {
          // Compute sliding window to keep selectedIndex visible
          const windowStart = Math.max(0, Math.min(
            filteredCommands.length - MAX_VISIBLE_COMMANDS,
            selectedIndex - Math.floor(MAX_VISIBLE_COMMANDS / 2)
          ));
          const visibleCommands = filteredCommands.slice(windowStart, windowStart + MAX_VISIBLE_COMMANDS);

          return visibleCommands.map((command, localIndex) => {
            const globalIndex = windowStart + localIndex;
            const isSelected = globalIndex === selectedIndex;
            return (
              <Box key={command.name} gap={1}>
                <Text color={isSelected ? palette.accent.primary : palette.text.primary}>
                  {isSelected ? '→' : ' '}
                </Text>
                <Text color={isSelected ? palette.accent.primary : palette.accent.secondary}>
                  /{command.name}
                </Text>
                <Text color={palette.text.secondary}>
                  {command.label}
                </Text>
                {command.shortcut && (
                  <Text color={palette.text.secondary}>
                    [⌘{command.shortcut}]
                  </Text>
                )}
              </Box>
            );
          });
        })()}
        {filteredCommands.length > MAX_VISIBLE_COMMANDS && (
          <Text color={palette.text.secondary}>
            {selectedIndex + 1} of {filteredCommands.length} commands
          </Text>
        )}
      </Box>

      {/* Footer with keyboard hints */}
      <Box borderStyle="single" borderColor={palette.chrome.border} paddingX={1}>
        <Text color={palette.text.secondary}>
          [↑↓] Navigate  [Enter] Execute  [Tab] Complete  [Esc] Close
        </Text>
      </Box>
    </Box>
  );
}
