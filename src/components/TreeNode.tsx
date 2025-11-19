import React from 'react';
import type { TreeNode as TreeNodeType, YellowwoodConfig, GitStatus } from '../types/index.js';
import { FolderNode } from './FolderNode.js';
import { FileNode } from './FileNode.js';

interface TreeNodeProps {
  node: TreeNodeType;
  selected: boolean;
  selectedPath: string;
  onSelect: (path: string) => void;  // Note: Not currently wired up; will be used for mouse support in #8
  onToggle: (path: string) => void;  // Note: Not currently wired up; will be used for mouse support in #8
  config: YellowwoodConfig;
}

/**
 * Map GitStatus to single-character marker
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

/**
 * Get color for node based on type and git status
 */
function getNodeColor(
  node: TreeNodeType,
  selected: boolean,
  showGitStatus: boolean
): string {
  // Selected items are always cyan (highlighted)
  if (selected) return 'cyan';

  // Git status colors (only if git status display is enabled)
  if (showGitStatus && node.gitStatus) {
    switch (node.gitStatus) {
      case 'modified':
        return 'yellow';
      case 'added':
        return 'green';
      case 'deleted':
        return 'red';
      case 'untracked':
        return 'gray';
      case 'ignored':
        return 'gray';
    }
  }

  // Default colors
  if (node.type === 'directory') {
    return 'blue';
  }

  return 'white'; // Default for clean files
}

/**
 * TreeNode component - delegates rendering to FolderNode or FileNode based on node type.
 * Maintains shared helper functions and recursion logic.
 */
export function TreeNode({
  node,
  selected,
  selectedPath,
  onSelect,
  onToggle,
  config,
}: TreeNodeProps): React.JSX.Element {
  // Delegate to FolderNode or FileNode based on type
  if (node.type === 'directory') {
    return (
      <FolderNode
        node={node}
        selected={selected}
        config={config}
        mapGitStatusMarker={mapGitStatusMarker}
        getNodeColor={getNodeColor}
      />
    );
  }

  return (
    <FileNode
      node={node}
      selected={selected}
      config={config}
      mapGitStatusMarker={mapGitStatusMarker}
      getNodeColor={getNodeColor}
    />
  );
}
