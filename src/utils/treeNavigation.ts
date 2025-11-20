import path from 'path';
import type { TreeNode } from '../types/index.js';
import { flattenVisibleTree, findNodeIndex, type FlattenedNode } from './treeViewVirtualization.js';

/**
 * Navigation helpers for tree operations.
 * These utilities provide the core navigation logic used by both TreeView and App.
 */

/**
 * Move selection up by delta rows.
 *
 * @param flattenedTree - Flattened tree nodes
 * @param currentPath - Currently selected path
 * @param delta - Number of rows to move (positive = down, negative = up)
 * @returns New selected path, or current path if movement not possible
 */
export function moveSelection(
  flattenedTree: FlattenedNode[],
  currentPath: string,
  delta: number
): string {
  const currentIndex = findNodeIndex(flattenedTree, currentPath);
  if (currentIndex < 0) {
    // Current path not found, select first node
    return flattenedTree[0]?.path || currentPath;
  }

  const newIndex = Math.max(0, Math.min(flattenedTree.length - 1, currentIndex + delta));
  return flattenedTree[newIndex]?.path || currentPath;
}

/**
 * Jump to start of tree.
 *
 * @param flattenedTree - Flattened tree nodes
 * @returns Path of first node, or empty string if tree is empty
 */
export function jumpToStart(flattenedTree: FlattenedNode[]): string {
  return flattenedTree[0]?.path || '';
}

/**
 * Jump to end of tree.
 *
 * @param flattenedTree - Flattened tree nodes
 * @returns Path of last node, or empty string if tree is empty
 */
export function jumpToEnd(flattenedTree: FlattenedNode[]): string {
  const lastIndex = flattenedTree.length - 1;
  return flattenedTree[lastIndex]?.path || '';
}

/**
 * Get the currently selected node.
 *
 * @param flattenedTree - Flattened tree nodes
 * @param currentPath - Currently selected path
 * @returns Selected node, or null if not found
 */
export function getCurrentNode(
  flattenedTree: FlattenedNode[],
  currentPath: string
): FlattenedNode | null {
  const index = findNodeIndex(flattenedTree, currentPath);
  return index >= 0 ? flattenedTree[index] : null;
}

/**
 * Determine action for right arrow key: expand folder if collapsed, or open if already expanded.
 *
 * @param node - Current node
 * @param expandedPaths - Set of expanded folder paths
 * @returns Action to take: 'expand' | 'open' | 'none'
 */
export function getRightArrowAction(
  node: FlattenedNode | null,
  expandedPaths: Set<string>
): 'expand' | 'open' | 'none' {
  if (!node) return 'none';

  if (node.type === 'directory') {
    // If directory is not expanded, expand it
    if (!expandedPaths.has(node.path)) {
      return 'expand';
    }
    // If directory is expanded but has no children, do nothing
    if (!node.children || node.children.length === 0) {
      return 'none';
    }
    // If directory is expanded and has children, move to first child (handled by navigation)
    return 'none';
  }

  // For files, right arrow opens the file
  return 'open';
}

/**
 * Determine action for left arrow key: collapse folder if expanded, or move to parent.
 *
 * @param node - Current node
 * @param flattenedTree - Flattened tree nodes
 * @param expandedPaths - Set of expanded folder paths
 * @returns Action object with type and optional target path
 */
export function getLeftArrowAction(
  node: FlattenedNode | null,
  flattenedTree: FlattenedNode[],
  expandedPaths: Set<string>
): { type: 'collapse' | 'parent' | 'none'; path?: string } {
  if (!node) return { type: 'none' };

  // If current node is an expanded directory, collapse it
  if (node.type === 'directory' && expandedPaths.has(node.path)) {
    return { type: 'collapse', path: node.path };
  }

  // Otherwise, move to parent
  const parentPath = getParentPath(node.path);
  if (!parentPath) {
    return { type: 'none' };
  }

  // Find parent in flattened tree
  const parentIndex = findNodeIndex(flattenedTree, parentPath);
  if (parentIndex >= 0) {
    return { type: 'parent', path: parentPath };
  }

  return { type: 'none' };
}

/**
 * Get parent path from a file/folder path.
 *
 * @param path - File or folder path
 * @returns Parent directory path, or null if at root
 */
export function getParentPath(filePath: string): string | null {
  const normalized = path.normalize(filePath);
  const parentPath = path.dirname(normalized);

  if (!parentPath || parentPath === '.' || parentPath === normalized) {
    return null;
  }

  return parentPath;
}

/**
 * Create flattened tree with expansion state applied.
 *
 * @param fileTree - Original file tree
 * @param expandedPaths - Set of expanded folder paths
 * @returns Flattened tree with correct expansion state
 */
export function createFlattenedTree(
  fileTree: TreeNode[],
  expandedPaths: Set<string>
): FlattenedNode[] {
  // Mark nodes as expanded based on expansion state
  const markExpanded = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.map((node) => ({
      ...node,
      expanded: expandedPaths.has(node.path) || node.expanded || false,
      children: node.children ? markExpanded(node.children) : undefined,
    }));
  };

  const markedTree = markExpanded(fileTree);
  return flattenVisibleTree(markedTree);
}

/**
 * Recursively search tree for a node with the given path.
 *
 * @param tree - Tree nodes to search
 * @param targetPath - Path to find
 * @returns true if path exists in tree, false otherwise
 */
export function findNodeInTree(tree: TreeNode[], targetPath: string): boolean {
  for (const node of tree) {
    if (node.path === targetPath) {
      return true;
    }
    if (node.children && node.children.length > 0) {
      if (findNodeInTree(node.children, targetPath)) {
        return true;
      }
    }
  }
  return false;
}
