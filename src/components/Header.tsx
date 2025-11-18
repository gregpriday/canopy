import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  cwd: string;
  filterActive: boolean;
  filterQuery: string;
}

export const Header: React.FC<HeaderProps> = ({ cwd, filterActive, filterQuery }) => {
  return (
    <Box borderStyle="single" paddingX={1}>
      <Text bold>Yellowwood</Text>
      <Text dimColor> - </Text>
      <Text>{cwd}</Text>
      {filterActive && (
        <>
          <Text dimColor> [</Text>
          <Text color="yellow">*</Text>
          <Text dimColor>] Filter: </Text>
          <Text color="cyan">{filterQuery}</Text>
        </>
      )}
    </Box>
  );
};
