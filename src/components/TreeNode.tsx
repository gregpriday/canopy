import React from 'react';
import { Box, Text } from 'ink';
import type { TreeNode as TreeNodeType, YellowwoodConfig, GitStatus } from '../types/index.js';

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
 * TreeNode component - renders a single tree node with icon, name, git marker, and children
 */
export function TreeNode({
  node,
  selected,
  selectedPath,
  onSelect,
  onToggle,
  config,
}: TreeNodeProps): React.JSX.Element {
  // Calculate indentation based on depth
  const indent = ' '.repeat(node.depth * config.treeIndent);

  // Select icon based on type and expansion state
  let icon: string;
  if (node.type === 'directory') {
    icon = node.expanded ? '\u25BC' : '\u25B6'; // ▼ : ▶
  } else {
    icon = '-';
  }

  // Get git status marker
  const gitMarker =
    config.showGitStatus && node.gitStatus
      ? ` ${mapGitStatusMarker(node.gitStatus)}`
      : '';

  // Get color
  const color = getNodeColor(node, selected, config.showGitStatus);

  // Determine if text should be dimmed (for deleted files, but never dim selected items)
  const dimmed = !selected && node.gitStatus === 'deleted';

  return (
    <Box flexDirection="column">
      {/* Current node row */}
      <Box>
        <Text color={color} dimColor={dimmed} bold={selected}>
          {indent}{icon} {node.name}{gitMarker}
        </Text>
      </Box>

      {/* Recursively render children if expanded */}
      {node.expanded && node.children && node.children.length > 0 && (
        <>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selected={child.path === selectedPath}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onToggle={onToggle}
              config={config}
            />
          ))}
        </>
      )}
    </Box>
  );
}
