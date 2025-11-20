import React from 'react';
import { Box, Text } from 'ink';
import type { TreeNode as TreeNodeType, CanopyConfig, GitStatus } from '../types/index.js';
import type { FlattenedNode } from '../utils/treeViewVirtualization.js';
import { getFolderIcon } from '../utils/fileIcons.js';
import { getFolderStyle } from '../utils/nodeStyling.js';

interface FolderNodeProps {
  node: TreeNodeType & Partial<FlattenedNode>;
  selected: boolean;
  config: CanopyConfig;
  mapGitStatusMarker: (status: GitStatus) => string;
  getNodeColor: (node: TreeNodeType, selected: boolean, showGitStatus: boolean) => string;
}

export function FolderNode({
  node,
  selected,
  config,
  mapGitStatusMarker,
  getNodeColor,
}: FolderNodeProps): React.JSX.Element {
  const treeGuide = ' '.repeat(node.depth * config.treeIndent);
  const icon = getFolderIcon(node.name, node.expanded || false);
  
  const gitMarker = config.showGitStatus && node.gitStatus
      ? ` ${mapGitStatusMarker(node.gitStatus)}`
      : '';

  // 1. Determine Style
  // Standard git/selection logic first
  let color = getNodeColor(node, selected, config.showGitStatus);
  let isBold = false;
  let isDimmed = !selected && node.gitStatus === 'deleted';
  
  // 2. Apply Custom Folder Styling if not selected/modified
  // (We want selection to override custom colors for readability)
  if (!selected && !node.gitStatus) {
    const style = getFolderStyle(node.name);
    if (style.color) color = style.color;
    if (style.bold) isBold = true;
    if (style.dimColor) isDimmed = true;
  }

  // 3. Recursive Git Count (Hidden Changes)
  // Only show if collapsed and has changes > 0
  const showHiddenChanges = !node.expanded && node.recursiveGitCount && node.recursiveGitCount > 0;

  // 4. Render Selected State (Inverted)
  if (selected) {
    return (
      <Box>
        <Text color="gray" dimColor>{treeGuide}</Text>
        <Box paddingX={1}>
          <Text backgroundColor="blue" color="white" bold>
            {icon} {node.name}
            {showHiddenChanges && <Text color="gray"> [{node.recursiveGitCount}]</Text>}
            {gitMarker}
          </Text>
        </Box>
      </Box>
    );
  }

  // 5. Render Standard State
  return (
    <Box>
      <Text color="gray" dimColor>{treeGuide}</Text>
      <Text color={color} dimColor={isDimmed} bold={isBold}>
        {icon} {node.name}
      </Text>
      {showHiddenChanges && (
        <Text color="gray" dimColor> [{node.recursiveGitCount}]</Text>
      )}
      <Text color={color}>
        {gitMarker}
      </Text>
    </Box>
  );
}