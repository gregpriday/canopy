/**
 * Tree guide utilities for rendering visual tree structure
 * Provides branch connector lines for improved visual hierarchy
 */

/**
 * Tree guide characters using box drawing characters
 */
export const TREE_CHARS = {
  /** Vertical line: │ */
  vertical: '│',
  /** Branch: ├─ */
  branch: '├─',
  /** Last branch: └─ */
  lastBranch: '└─',
  /** Spacing for alignment */
  space: '  ',
} as const;

/**
 * Generate tree guide prefix for a node based on its position in the tree
 *
 * @param depth - Depth of the node in the tree (0 = root)
 * @param isLastSiblingAtDepth - Array indicating if node is last sibling at each depth level
 * @param treeIndent - Indentation width (characters per level)
 * @returns Tree guide string (e.g., "│  ├─ " or "   └─ ")
 *
 * @example
 * ```
 * // For a tree like:
 * // root
 * // ├─ folder1
 * // │  ├─ file1.txt
 * // │  └─ file2.txt
 * // └─ folder2
 *
 * getTreeGuide(0, [], 2)          // "" (root, no guides)
 * getTreeGuide(1, [false], 2)     // "├─ " (folder1, not last)
 * getTreeGuide(2, [false, false], 2) // "│  ├─ " (file1.txt)
 * getTreeGuide(2, [false, true], 2)  // "│  └─ " (file2.txt, last in folder1)
 * getTreeGuide(1, [true], 2)      // "└─ " (folder2, last)
 * ```
 */
export function getTreeGuide(
  depth: number,
  isLastSiblingAtDepth: boolean[],
  treeIndent: number = 2,
): string {
  if (depth === 0) {
    return '';
  }

  const guides: string[] = [];

  // Build guides for each ancestor level
  for (let i = 0; i < depth - 1; i++) {
    if (isLastSiblingAtDepth[i]) {
      // Ancestor was last sibling, use space
      guides.push(TREE_CHARS.space);
    } else {
      // Ancestor has more siblings, show vertical line
      guides.push(TREE_CHARS.vertical + ' ');
    }
  }

  // Add branch connector for current node
  if (isLastSiblingAtDepth[depth - 1]) {
    guides.push(TREE_CHARS.lastBranch);
  } else {
    guides.push(TREE_CHARS.branch);
  }

  return guides.join('');
}

/**
 * Calculate whether a node is the last sibling at each depth level
 *
 * @param nodePath - Path of the current node
 * @param nodeDepth - Depth of the current node
 * @param allNodes - All flattened nodes in the tree
 * @param nodeIndex - Index of current node in flattened array
 * @returns Array where each element indicates if node is last sibling at that depth
 */
export function calculateIsLastSibling(
  nodePath: string,
  nodeDepth: number,
  allNodes: Array<{ path: string; depth: number }>,
  nodeIndex: number,
): boolean[] {
  const result: boolean[] = [];

  if (nodeDepth === 0) {
    return result;
  }

  // For each depth level, check if there are more siblings after this node
  for (let checkDepth = 1; checkDepth <= nodeDepth; checkDepth++) {
    let isLast = true;

    // Look ahead in the flattened tree
    for (let i = nodeIndex + 1; i < allNodes.length; i++) {
      const nextNode = allNodes[i];

      // If we find a node at the same depth, this node is not the last sibling
      if (nextNode.depth === checkDepth) {
        // Check if it's a sibling (shares same parent path)
        const currentParentPath = getParentPath(nodePath, nodeDepth - checkDepth + 1);
        const nextParentPath = getParentPath(nextNode.path, nextNode.depth - checkDepth + 1);

        if (currentParentPath === nextParentPath) {
          isLast = false;
          break;
        }
      }

      // If we've gone shallower than checkDepth, no more siblings at this level
      if (nextNode.depth < checkDepth) {
        break;
      }
    }

    result[checkDepth - 1] = isLast;
  }

  return result;
}

/**
 * Get parent path by removing N levels from the end
 *
 * @param path - Full path
 * @param levelsToRemove - Number of levels to remove from the end
 * @returns Parent path
 */
function getParentPath(path: string, levelsToRemove: number): string {
  const parts = path.split('/').filter(Boolean);
  return '/' + parts.slice(0, -levelsToRemove).join('/');
}

/**
 * Tree guide style properties
 */
export interface TreeGuideStyle {
  color?: string;
  bold?: boolean;
  dimColor?: boolean;
}

/**
 * Get style for tree guide based on whether it's on the active path
 *
 * @param isActive - Whether the guide is on the active path
 * @param activeColor - Color to use for active guides (default: 'cyan')
 */
export function getGuideStyle(
  isActive: boolean,
  activeColor: 'cyan' | 'blue' | 'green' = 'cyan'
): TreeGuideStyle {
  if (isActive) {
    return {
      color: activeColor,
      bold: true,
    };
  }

  return {
    color: 'gray',
    dimColor: true,
  };
}

/**
 * Generate styled tree guide prefix for a node
 *
 * @param depth - Depth of the node in the tree (0 = root)
 * @param isLastSiblingAtDepth - Array indicating if node is last sibling at each depth level
 * @param isActive - Whether this node is on the active path to selection
 * @param treeIndent - Indentation width (characters per level)
 * @param activeColor - Color to use for active guides (default: 'cyan')
 * @returns Object with guide string and style properties
 */
export function getStyledTreeGuide(
  depth: number,
  isLastSiblingAtDepth: boolean[],
  isActive: boolean,
  treeIndent: number = 2,
  activeColor: 'cyan' | 'blue' | 'green' = 'cyan'
): { guide: string; style: TreeGuideStyle } {
  const guide = getTreeGuide(depth, isLastSiblingAtDepth, treeIndent);
  const style = getGuideStyle(isActive, activeColor);

  return { guide, style };
}
