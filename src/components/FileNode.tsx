import React from 'react';
import { Box, Text } from 'ink';
import type { TreeNode, YellowwoodConfig, GitStatus } from '../types/index.js';

export interface FileNodeProps {
  node: TreeNode;
  config: YellowwoodConfig;
  isSelected: boolean;
}

export function FileNode({ node, config, isSelected }: FileNodeProps): React.JSX.Element {

  // Calculate indentation
  const indent = ' '.repeat(node.depth * config.treeIndent);

  // File icon (simple dash for now)
  const icon = '-';

  // Selection indicator (optional prefix)
  const selectionPrefix = isSelected ? '> ' : '  ';

  // Git status character
  const gitStatusChar = getGitStatusChar(node.gitStatus, config.showGitStatus);

  // Optional metadata
  const sizeText = config.showFileSize && node.size !== undefined
    ? formatBytes(node.size)
    : '';

  const modifiedText = config.showModifiedTime && node.modified !== undefined
    ? formatDate(node.modified)
    : '';

  // Determine text color based on git status
  const textColor = getFileColor(node.gitStatus, isSelected, config.showGitStatus);

  return (
    <Box>
      {/* Indentation + selection indicator */}
      <Text>{indent}{selectionPrefix}</Text>

      {/* File icon */}
      <Text dimColor>{icon} </Text>

      {/* File name */}
      <Text color={textColor} backgroundColor={isSelected ? 'blue' : undefined}>
        {node.name}
      </Text>

      {/* Spacer before metadata */}
      <Text> </Text>

      {/* Optional file size */}
      {sizeText && (
        <Text dimColor>{sizeText.padStart(8)}</Text>
      )}

      {/* Optional modified time */}
      {modifiedText && (
        <Text dimColor> {modifiedText}</Text>
      )}

      {/* Git status marker (right-aligned) */}
      {config.showGitStatus && (
        <Text color={getGitStatusColor(node.gitStatus)}> {gitStatusChar}</Text>
      )}
    </Box>
  );
}

/**
 * Get git status character to display.
 */
function getGitStatusChar(status: GitStatus | undefined, showGitStatus: boolean): string {
  if (!showGitStatus || !status) {
    return ' '; // Space for alignment when git status disabled/absent
  }

  const statusMap: Record<GitStatus, string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    untracked: 'U',
    ignored: 'I',
  };

  return statusMap[status] || ' ';
}

/**
 * Get color for git status marker.
 */
function getGitStatusColor(status: GitStatus | undefined): string | undefined {
  if (!status) return undefined;

  const colorMap: Record<GitStatus, string> = {
    modified: 'yellow',
    added: 'green',
    deleted: 'red',
    untracked: 'gray',
    ignored: 'gray',
  };

  return colorMap[status];
}

/**
 * Get file text color based on state.
 */
function getFileColor(status: GitStatus | undefined, isSelected: boolean, showGitStatus: boolean): string | undefined {
  // Selected files use default color with background highlight
  if (isSelected) {
    return 'white';
  }

  // Only color based on git status if git status is enabled
  if (showGitStatus && status) {
    const colorMap: Record<GitStatus, string | undefined> = {
      modified: 'yellow',
      added: 'green',
      deleted: 'red',
      untracked: 'gray',
      ignored: 'gray',
    };
    return colorMap[status];
  }

  // Default: no specific color (terminal default)
  return undefined;
}

/**
 * Format file size in human-readable format.
 *
 * @param bytes - File size in bytes
 * @returns Formatted string like "2.4 KB" or "156 B"
 */
function formatBytes(bytes: number): string {
  // Guard against invalid input
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const value = bytes / Math.pow(k, i);

  // Format with appropriate precision
  if (i === 0) {
    return `${bytes} B`;
  } else {
    return `${value.toFixed(1)} ${units[i]}`;
  }
}

/**
 * Format date in short ISO format (YYYY-MM-DD).
 *
 * @param date - Date object
 * @returns Formatted date string or empty string if invalid
 */
function formatDate(date: Date): string {
  // Validate date object
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
