import React from 'react';
import { Box, Text } from 'ink';
import type { TreeNode as TreeNodeType, CanopyConfig, GitStatus } from '../types/index.js';

interface FolderNodeProps {
  node: TreeNodeType;
  selected: boolean;
  config: CanopyConfig;
  mapGitStatusMarker: (status: GitStatus) => string;
  getNodeColor: (node: TreeNodeType, selected: boolean, showGitStatus: boolean) => string;
}

/**
 * FolderNode component - renders a directory node with expansion icon, name, and git status.
 * With virtualization, child rendering is handled by TreeView, not recursively here.
 */
export function FolderNode({
  node,
  selected,
  config,
  mapGitStatusMarker,
  getNodeColor,
}: FolderNodeProps): React.JSX.Element {
  // Calculate indentation based on depth
  const indent = ' '.repeat(node.depth * config.treeIndent);

  // Expansion icon based on folder state
  const icon = node.expanded ? '\u25BC' : '\u25B6'; // � : �

  // Get git status marker if enabled
  const gitMarker =
    config.showGitStatus && node.gitStatus
      ? ` ${mapGitStatusMarker(node.gitStatus)}`
      : '';

  // Get color for the folder
  const color = getNodeColor(node, selected, config.showGitStatus);

  // Determine if text should be dimmed (for deleted folders, but never dim selected items)
  const dimmed = !selected && node.gitStatus === 'deleted';

  return (
    <Box>
      <Text color={color} dimColor={dimmed} bold={selected}>
        {indent}{icon} {node.name}{gitMarker}
      </Text>
    </Box>
  );
}
