import React from 'react';
import { Box, Text } from 'ink';
import type { TreeNode, YellowwoodConfig } from '../types/index.js';

interface TreeViewProps {
  fileTree: TreeNode[];
  selectedPath: string;
  onSelect: (path: string) => void;
  config: YellowwoodConfig;
}

export const TreeView: React.FC<TreeViewProps> = ({ fileTree, selectedPath, onSelect, config }) => {
  if (fileTree.length === 0) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text dimColor>No files to display</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {fileTree.map((node) => (
        <Box key={node.path}>
          <Text>{node.type === 'directory' ? '=Á' : '=Ä'} {node.name}</Text>
        </Box>
      ))}
    </Box>
  );
};
