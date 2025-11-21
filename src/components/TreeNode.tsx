import React from 'react';
import type { TreeNode as TreeNodeType, CanopyConfig, GitStatus } from '../types/index.js';
import { FolderNode } from './FolderNode.js';
import { FileNode } from './FileNode.js';
import { useTheme } from '../theme/ThemeProvider.js';

interface TreeNodeProps {
  node: TreeNodeType;
  selected: boolean;
  selectedPath: string | null;
  config: CanopyConfig;
}

/**
 * Map GitStatus to letter marker
 */
function mapGitStatusMarker(status: GitStatus): string {
  const markers: Record<GitStatus, string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    untracked: 'U',
    ignored: 'I',
  };
  return markers[status];
}

// Note: getNodeColor is now defined inside the TreeNode component
// to access the palette via useTheme() hook

/**
 * TreeNode component - delegates rendering to FolderNode or FileNode based on node type.
 * Maintains shared helper functions and recursion logic.
 */
export function TreeNode({
  node,
  selected,
  selectedPath,
  config,
}: TreeNodeProps): React.JSX.Element {
  const { palette } = useTheme();

  // Create a palette-aware getNodeColor function
  const getNodeColorWithPalette = (
    node: TreeNodeType,
    selected: boolean,
    showGitStatus: boolean
  ): string => {
    // Selected items are always selection.text (cyan)
    if (selected) return palette.selection.text;

    // Git status colors (only if git status display is enabled)
    if (showGitStatus && node.gitStatus) {
      switch (node.gitStatus) {
        case 'modified':
          return palette.git.modified;
        case 'added':
          return palette.git.added;
        case 'deleted':
          return palette.git.deleted;
        case 'untracked':
          return palette.git.untracked;
        case 'ignored':
          return palette.git.ignored;
      }
    }

    // Default colors
    if (node.type === 'directory') {
      return palette.text.secondary;
    }

    return palette.text.primary; // Default for clean files
  };

  // Delegate to FolderNode or FileNode based on type
  if (node.type === 'directory') {
    return (
      <FolderNode
        node={node}
        selected={selected}
        selectedPath={selectedPath}
        config={config}
        mapGitStatusMarker={mapGitStatusMarker}
        getNodeColor={getNodeColorWithPalette}
      />
    );
  }

  return (
    <FileNode
      node={node}
      selected={selected}
      selectedPath={selectedPath}
      config={config}
      mapGitStatusMarker={mapGitStatusMarker}
      getNodeColor={getNodeColorWithPalette}
    />
  );
}
