import React from 'react';
import { Box, Text } from 'ink';
import type { TreeNode as TreeNodeType, CanopyConfig, GitStatus } from '../types/index.js';
import type { FlattenedNode } from '../utils/treeViewVirtualization.js';
import { getFileIcon } from '../utils/fileIcons.js';
import { getFileColor } from '../utils/nodeStyling.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { getStyledTreeGuide } from '../utils/treeGuides.js';
import { isOnActivePath } from '../utils/pathAncestry.js';

interface FileNodeProps {
  node: TreeNodeType & Partial<FlattenedNode>;
  selected: boolean;
  selectedPath: string | null;
  config: CanopyConfig;
  mapGitStatusMarker: (status: GitStatus) => string;
  getNodeColor: (node: TreeNodeType, selected: boolean, showGitStatus: boolean) => string;
}

export function FileNode({
  node,
  selected,
  selectedPath,
  config,
  mapGitStatusMarker,
  getNodeColor,
}: FileNodeProps): React.JSX.Element {
  const { palette } = useTheme();
  // 1. Setup Guides & Icons
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
  const icon = getFileIcon(node.name);

  // 2. Git Status Logic
  const gitMarker = config.showGitStatus && node.gitStatus
      ? ` ${mapGitStatusMarker(node.gitStatus)}`
      : '';
  const isGitModified = config.showGitStatus && !!node.gitStatus;

  // 3. Determine Base Color
  // If selected, force cyan. If git modified, force git color.
  // Otherwise, check our custom styling.
  let baseColor = getNodeColor(node, selected, config.showGitStatus);
  if (!selected && !isGitModified) {
    const customColor = getFileColor(node.name, palette);
    if (customColor) baseColor = customColor;
  }

  // 4. Split Filename for Extension Dimming
  // We only split if it's not a dotfile (like .gitignore)
  const lastDotIndex = node.name.lastIndexOf('.');
  const hasExtension = lastDotIndex > 0; 
  
  const nameBase = hasExtension ? node.name.substring(0, lastDotIndex) : node.name;
  const nameExt = hasExtension ? node.name.substring(lastDotIndex) : '';

  if (selected) {
    return (
      <Box>
        <Text color={style.color} dimColor={style.dimColor} bold={style.bold}>
          {guide}
        </Text>
        <Box paddingX={1}>
          <Text backgroundColor={palette.selection.background} color={palette.selection.text} bold>
            {icon} {nameBase}
            {nameExt && (
              <Text color={palette.selection.text}>
                {nameExt}
              </Text>
            )}
            {gitMarker}
          </Text>
        </Box>
      </Box>
    );
  }

  // 5. Render (unselected state)
  // Selected files are handled above. Here we dim extensions when not focused.
  return (
    <Box>
      <Text color={style.color} dimColor={style.dimColor} bold={style.bold}>
        {guide}
      </Text>
      <Text color={baseColor} dimColor={node.gitStatus === 'deleted'}>
        {icon} {nameBase}
      </Text>
      {nameExt && (
        <Text
          color={baseColor}
          dimColor
        >
          {nameExt}
        </Text>
      )}
      <Text color={baseColor}>
        {gitMarker}
      </Text>
    </Box>
  );
}
