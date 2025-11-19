import React from 'react';
import { Box, Text } from 'ink';
import type { TreeNode as TreeNodeType, CanopyConfig, GitStatus } from '../types/index.js';

interface FileNodeProps {
  node: TreeNodeType;
  selected: boolean;
  config: CanopyConfig;
  mapGitStatusMarker: (status: GitStatus) => string;
  getNodeColor: (node: TreeNodeType, selected: boolean, showGitStatus: boolean) => string;
}

/**
 * FileNode component - renders a file node with icon, name, and git status.
 * Files are leaf nodes and do not have children.
 */
export function FileNode({
  node,
  selected,
  config,
  mapGitStatusMarker,
  getNodeColor,
}: FileNodeProps): React.JSX.Element {
  // Calculate indentation based on depth
  const indent = ' '.repeat(node.depth * config.treeIndent);

  // File icon (simple dash)
  const icon = '-';

  // Get git status marker if enabled
  const gitMarker =
    config.showGitStatus && node.gitStatus
      ? ` ${mapGitStatusMarker(node.gitStatus)}`
      : '';

  // Get color for the file
  const color = getNodeColor(node, selected, config.showGitStatus);

  // Determine if text should be dimmed (for deleted files, but never dim selected items)
  const dimmed = !selected && node.gitStatus === 'deleted';

  return (
    <Box>
      <Text color={color} dimColor={dimmed} bold={selected}>
        {indent}{icon} {node.name}{gitMarker}
      </Text>
    </Box>
  );
}
