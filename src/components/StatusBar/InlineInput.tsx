import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { getAllCommands } from '../../commands/registry.js';

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
  
  // 1. Get all available commands
  const allCommands = useMemo(() => getAllCommands(), []);

  // 2. Filter suggestions based on current input
  const suggestions = useMemo(() => {
    if (!input) return [];
    const cleanInput = input.toLowerCase();
    return allCommands.filter(cmd => 
      cmd.name.toLowerCase().startsWith(cleanInput) ||
      cmd.aliases?.some(alias => alias.toLowerCase().startsWith(cleanInput))
    );
  }, [input, allCommands]);

  // Reset selection when input changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [input]);

  useInput((_in, key) => {
    // Cancel
    if (key.escape) {
      onCancel();
      return;
    }

    // Navigation: Up
    if (key.upArrow) {
      if (suggestions.length > 0) {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
      }
      return;
    }

    // Navigation: Down
    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
      }
      return;
    }

    // Autocomplete: Tab
    if (key.tab) {
      if (suggestions.length > 0) {
        const selectedCmd = suggestions[selectedIndex];
        // Set input to the command name + space
        onChange(`${selectedCmd.name} `); 
      }
      return;
    }
  });

  return (
    <Box flexDirection="column">
      {/* Suggestion List (Renders above the input) */}
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

      {/* Input Line */}
      <Box>
        {/* The slash prompt */}
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