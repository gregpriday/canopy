import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { getAllCommands } from '../commands/registry.js';

interface InlineInputProps {
  input: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export const InlineInput: React.FC<InlineInputProps> = ({
  input,
  onChange,
  onSubmit,
  onCancel,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allCommands = useMemo(() => getAllCommands(), []);

  const suggestions = useMemo(() => {
    if (!input) return [];
    const cleanInput = input.toLowerCase();
    return allCommands.filter(cmd =>
      cmd.name.toLowerCase().startsWith(cleanInput) ||
      cmd.aliases?.some(alias => alias.toLowerCase().startsWith(cleanInput))
    );
  }, [input, allCommands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [input]);

  useInput((_in, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.upArrow) {
      if (suggestions.length > 0) {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
      }
      return;
    }

    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
      }
      return;
    }

    if (key.tab) {
      if (suggestions.length > 0) {
        const selectedCmd = suggestions[selectedIndex];
        onChange(`${selectedCmd.name} `);
      }
      return;
    }
  });

  return (
    <Box flexDirection="column">
      {suggestions.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          marginBottom={0}
          paddingX={1}
        >
          <Text dimColor>Available commands:</Text>
          {suggestions.map((cmd, index) => (
            <Box key={cmd.name}>
              <Text color={index === selectedIndex ? 'cyan' : 'gray'}>
                {index === selectedIndex ? '> ' : '  '}
                {cmd.name}
              </Text>
              <Text dimColor> - {cmd.description}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box>
        <Text color="cyan" bold>/</Text>
        <TextInput
          value={input}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="type a command..."
        />
      </Box>
    </Box>
  );
};
