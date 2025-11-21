import React from 'react';
import { Box, Text } from 'ink';
import type { TreeNode as TreeNodeType, CanopyConfig, GitStatus } from '../types/index.js';
import type { FlattenedNode } from '../utils/treeViewVirtualization.js';
import { getFolderIcon } from '../utils/fileIcons.js';
import { getFolderStyle } from '../utils/nodeStyling.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { getStyledTreeGuide } from '../utils/treeGuides.js';
import { isOnActivePath } from '../utils/pathAncestry.js';

interface FolderNodeProps {
  node: TreeNodeType & Partial<FlattenedNode>;
  selected: boolean;
  selectedPath: string | null;
  config: CanopyConfig;
  mapGitStatusMarker: (status: GitStatus) => string;
  getNodeColor: (node: TreeNodeType, selected: boolean, showGitStatus: boolean) => string;
}

export function FolderNode({
  node,
  selected,
  selectedPath,
  config,
  mapGitStatusMarker,
  getNodeColor,
}: FolderNodeProps): React.JSX.Element {
  const { palette } = useTheme();
  const enableHighlight = config.ui?.activePathHighlight !== false;
  const isActive = enableHighlight && isOnActivePath(node.path, selectedPath);
  const activeColor = config.ui?.activePathColor || 'cyan';
  const { guide, style } = getStyledTreeGuide(
    node.depth,
    node.isLastSiblingAtDepth || [],
    isActive,
    config.treeIndent,
    activeColor
  );
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
    const style = getFolderStyle(node.name, palette);
    if (style.color) color = style.color;
    if (style.bold) isBold = true;
    if (style.dimColor) isDimmed = true;
  }

  // 3. Recursive Git Count (Hidden Changes)
  // Only show if collapsed and has changes > 0
  const showHiddenChanges = !node.expanded && (node.recursiveGitCount || 0) > 0;

  // 4. Render Selected State (Inverted)
  if (selected) {
    return (
      <Box>
        <Text color={style.color} dimColor={style.dimColor} bold={style.bold}>
          {guide}
        </Text>
        <Box paddingX={1}>
          <Text backgroundColor={palette.selection.background} color={palette.selection.text} bold>
            {icon} {node.name}
            {showHiddenChanges && <Text color={palette.text.tertiary}> [{node.recursiveGitCount}]</Text>}
            {gitMarker}
          </Text>
        </Box>
      </Box>
    );
  }

  // 5. Render Standard State
  return (
    <Box>
      <Text color={style.color} dimColor={style.dimColor} bold={style.bold}>
        {guide}
      </Text>
      <Text color={color} dimColor={isDimmed} bold={isBold}>
        {icon} {node.name}
      </Text>
      {showHiddenChanges && (
        <Text color={palette.text.tertiary} dimColor> [{node.recursiveGitCount}]</Text>
      )}
      <Text color={color}>
        {gitMarker}
      </Text>
    </Box>
  );
}