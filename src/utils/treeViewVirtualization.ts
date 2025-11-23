import type { TreeNode } from '../types/index.js';

/**
 * Flattened tree node with additional metadata for virtualization.
 */
export interface FlattenedNode extends TreeNode {
  /** Original depth in tree hierarchy */
  depth: number;
  /** Index in the flattened array */
  index: number;
  /** Indicates if node is last sibling at each depth level (for tree guides) */
  isLastSiblingAtDepth: boolean[];
}

/**
 * Result of visible window calculation.
 */
export interface VisibleWindow {
  /** Nodes visible in current viewport */
  nodes: FlattenedNode[];
  /** First visible row index */
  startIndex: number;
  /** Last visible row index (exclusive) */
  endIndex: number;
  /** Total number of nodes in flattened tree */
  totalNodes: number;
  /** Number of nodes scrolled past (above viewport) */
  scrolledPast: number;
  /** Number of nodes remaining (below viewport) */
  remaining: number;
}

/**
 * Flatten a hierarchical tree into a 1D array of visible nodes.
 * Only includes nodes whose parent chain is fully expanded.
 *
 * @param nodes - Root tree nodes
 * @param depth - Current depth (used for recursion, defaults to 0)
 * @returns Flattened array of visible nodes with index metadata
 *
 * @example
 * ```typescript
 * const tree = [
 *   { name: 'folder', type: 'directory', expanded: true, children: [
 *     { name: 'file.txt', type: 'file' }
 *   ]}
 * ];
 * const flat = flattenVisibleTree(tree);
 * // Returns: [
 * //   { name: 'folder', depth: 0, index: 0, ... },
 * //   { name: 'file.txt', depth: 1, index: 1, ... }
 * // ]
 * ```
 */
export function flattenVisibleTree(
  nodes: TreeNode[],
  depth = 0,
): FlattenedNode[] {
  const result: FlattenedNode[] = [];
  let index = 0;

  function traverse(
    nodeList: TreeNode[],
    currentDepth: number,
    parentIsLastSiblingPath: boolean[] = [],
  ): void {
    for (let i = 0; i < nodeList.length; i++) {
      const node = nodeList[i];
      const isLastSibling = i === nodeList.length - 1;

      // Build isLastSiblingAtDepth array for tree guides
      const isLastSiblingAtDepth = [...parentIsLastSiblingPath];
      if (currentDepth > 0) {
        isLastSiblingAtDepth[currentDepth - 1] = isLastSibling;
      }

      // Add current node with metadata
      const flatNode: FlattenedNode = {
        ...node,
        depth: currentDepth,
        index: result.length,
        isLastSiblingAtDepth,
      };
      result.push(flatNode);
      index++;

      // Only traverse children if this directory is expanded
      if (
        node.type === 'directory' &&
        node.expanded &&
        node.children &&
        node.children.length > 0
      ) {
        traverse(node.children, currentDepth + 1, isLastSiblingAtDepth);
      }
    }
  }

  traverse(nodes, depth);
  return result;
}

/**
 * Calculate which nodes should be rendered based on scroll position and viewport height.
 *
 * @param flatNodes - Flattened tree nodes
 * @param scrollOffset - Index of first visible row (0-based)
 * @param viewportHeight - Number of rows that fit in viewport
 * @returns Visible window with nodes and metadata
 *
 * @example
 * ```typescript
 * const flat = flattenVisibleTree(tree);
 * const window = calculateVisibleWindow(flat, 10, 20);
 * // Returns nodes 10-29 (20 nodes starting at index 10)
 * ```
 */
export function calculateVisibleWindow(
  flatNodes: FlattenedNode[],
  scrollOffset: number,
  viewportHeight: number,
): VisibleWindow {
  const totalNodes = flatNodes.length;

  // Only clamp to top; allow offsets beyond bottom for elastic space after collapses
  const clampedOffset = Math.max(0, scrollOffset);

  // Calculate window bounds
  const startIndex = clampedOffset;
  const endIndex = Math.min(totalNodes, clampedOffset + viewportHeight);

  // Slice visible nodes
  const visibleNodes = flatNodes.slice(startIndex, endIndex);

  // Calculate metadata
  const scrolledPast = startIndex;
  const remaining = Math.max(0, totalNodes - endIndex);

  return {
    nodes: visibleNodes,
    startIndex,
    endIndex,
    totalNodes,
    scrolledPast,
    remaining,
  };
}

/**
 * Get the current terminal height in rows.
 * Falls back to 24 rows if unavailable (common default terminal height).
 *
 * @returns Terminal height in rows
 */
export function getTerminalHeight(): number {
  // process.stdout.rows is available in Node.js terminals
  // Falls back to 24 (standard terminal height) if unavailable
  return process.stdout.rows || 24;
}

/**
 * Calculate viewport height by subtracting UI elements from terminal height.
 *
 * @param reservedRows - Number of rows reserved for header/overlays (default: 2)
 * @returns Available viewport height for tree content
 */
export function calculateViewportHeight(reservedRows = 2): number {
  const terminalHeight = getTerminalHeight();
  // Ensure at least 1 row for content
  return Math.max(1, terminalHeight - reservedRows);
}

/**
 * Find the index of a node by its path in the flattened tree.
 *
 * @param flatNodes - Flattened tree nodes
 * @param path - Path to search for
 * @returns Index of node, or -1 if not found
 */
export function findNodeIndex(
  flatNodes: FlattenedNode[],
  path: string,
): number {
  return flatNodes.findIndex((node) => node.path === path);
}

/**
 * Calculate the scroll offset needed to make a specific node visible.
 *
 * @param nodeIndex - Index of the node to make visible
 * @param currentScrollOffset - Current scroll offset
 * @param viewportHeight - Viewport height in rows
 * @returns New scroll offset to make node visible
 */
export function calculateScrollToNode(
  nodeIndex: number,
  currentScrollOffset: number,
  viewportHeight: number,
): number {
  // If node is above viewport, scroll up to show it at the top
  if (nodeIndex < currentScrollOffset) {
    return nodeIndex;
  }

  // If node is below viewport, scroll down to show it at the bottom
  if (nodeIndex >= currentScrollOffset + viewportHeight) {
    return nodeIndex - viewportHeight + 1;
  }

  // Node is already visible, don't change scroll offset
  return currentScrollOffset;
}
