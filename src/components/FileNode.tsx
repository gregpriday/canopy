import React from 'react';
import { Box, Text } from 'ink';
import type { TreeNode as TreeNodeType, CanopyConfig, GitStatus } from '../types/index.js';
import type { FlattenedNode } from '../utils/treeViewVirtualization.js';
import { getFileIcon } from '../utils/fileIcons.js';
import { getFileColor } from '../utils/nodeStyling.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { getStyledTreeGuide } from '../utils/treeGuides.js';
import { isOnActivePath } from '../utils/pathAncestry.js';
import { GitIndicator } from '../utils/gitIndicators.js';
import { getTemporalState } from '../hooks/useActivity.js';

interface FileNodeProps {
  node: TreeNodeType & Partial<FlattenedNode>;
  selected: boolean;
  selectedPath: string | null;
  config: CanopyConfig;
  mapGitStatusMarker: (status: GitStatus) => string;
  getNodeColor: (node: TreeNodeType, selected: boolean, showGitStatus: boolean) => string;
  activeFiles?: Map<string, number>;
}

export function FileNode({
  node,
  selected,
  selectedPath,
  config,
  mapGitStatusMarker,
  getNodeColor,
  activeFiles,
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

  // 1.5. Temporal State Logic (NEW)
  const temporalState = activeFiles
    ? getTemporalState(node.path, activeFiles)
    : 'normal';
  const isFlashing = temporalState === 'flash';
  const isCooldown = temporalState === 'cooldown';

  // 2. Git Status Logic
  const useGlyphStyle = config.git?.statusStyle !== 'letter';
  const gitMarker = config.showGitStatus && node.gitStatus ? (
    useGlyphStyle ? (
      <>
        {' '}
        <GitIndicator status={node.gitStatus} />
      </>
    ) : (
      ` ${mapGitStatusMarker(node.gitStatus)}`
    )
  ) : null;
  const isGitModified = config.showGitStatus && !!node.gitStatus;

  // 3. Determine Base Color
  // If selected, force cyan. If git modified, force git color.
  // Otherwise, check our custom styling.
  let baseColor = getNodeColor(node, selected, config.showGitStatus);

  // Override with temporal styling (flash state takes precedence)
  if (isFlashing) {
    baseColor = 'green'; // Bold green for flash state
  } else if (!selected && !isGitModified) {
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
        {isFlashing && <Text color="green" bold>⚡ </Text>}
        <Box paddingX={1}>
          <Text
            backgroundColor={palette.selection.background}
            color={isFlashing ? 'green' : palette.selection.text}
            bold
          >
            {icon} {nameBase}
            {nameExt && (
              <Text color={isFlashing ? 'green' : palette.selection.text}>
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
      {isFlashing && <Text color="green" bold>⚡ </Text>}
      <Text
        color={baseColor}
        dimColor={node.gitStatus === 'deleted'}
        bold={isFlashing || isCooldown}
      >
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
