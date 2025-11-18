import type { TreeNode, GitStatus } from '../types/index.js';

/**
 * Filter tree nodes by name pattern using fuzzy matching.
 * Preserves folder hierarchy - parent folders are included if any descendant matches.
 *
 * @param tree - Array of TreeNode to filter
 * @param pattern - Fuzzy search pattern (case-insensitive)
 * @returns Filtered tree with matching nodes and their ancestors
 */
export function filterTreeByName(tree: TreeNode[], pattern: string): TreeNode[] {
  // Empty pattern = no filtering
  if (!pattern || pattern.trim() === '') {
    return tree;
  }

  const normalizedPattern = pattern.toLowerCase().trim();
  const visited = new Set<string>();

  return tree
    .map(node => filterNodeByName(node, normalizedPattern, visited))
    .filter((node): node is TreeNode => node !== null);
}

/**
 * Filter tree nodes by git status.
 * Preserves folder hierarchy - parent folders are included if any descendant matches.
 *
 * @param tree - Array of TreeNode to filter
 * @param status - Git status to filter by
 * @returns Filtered tree with matching nodes and their ancestors
 */
export function filterTreeByGitStatus(tree: TreeNode[], status: GitStatus): TreeNode[] {
  const visited = new Set<string>();
  return tree
    .map(node => filterNodeByGitStatus(node, status, visited))
    .filter((node): node is TreeNode => node !== null);
}

/**
 * Recursively filter a node by name pattern.
 * Returns the node if it or any descendant matches, null otherwise.
 */
function filterNodeByName(node: TreeNode, pattern: string, visited: Set<string> = new Set()): TreeNode | null {
  // Prevent infinite recursion from circular references
  if (visited.has(node.path)) {
    return null; // Skip circular references
  }

  visited.add(node.path);

  const nameMatches = matchesFuzzy(node.name.toLowerCase(), pattern);

  // For files: include if name matches
  if (node.type === 'file') {
    return nameMatches ? cloneNode(node) : null;
  }

  // For folders: if folder name matches, include it with all descendants
  if (nameMatches) {
    return deepCloneNode(node);
  }

  // For folders: check children recursively
  if (node.children) {
    const filteredChildren = node.children
      .map(child => filterNodeByName(child, pattern, visited))
      .filter((child): child is TreeNode => child !== null);

    // Include folder if it has matching children
    if (filteredChildren.length > 0) {
      return {
        ...cloneNode(node),
        children: filteredChildren,
      };
    }
  }

  // Folder doesn't match and has no matching children
  return null;
}

/**
 * Recursively filter a node by git status.
 * Returns the node if it or any descendant matches, null otherwise.
 */
function filterNodeByGitStatus(node: TreeNode, status: GitStatus, visited: Set<string> = new Set()): TreeNode | null {
  // Prevent infinite recursion from circular references
  if (visited.has(node.path)) {
    return null; // Skip circular references
  }

  visited.add(node.path);

  const statusMatches = node.gitStatus === status;

  // For files: include if git status matches
  if (node.type === 'file') {
    return statusMatches ? cloneNode(node) : null;
  }

  // For folders: check children recursively
  if (node.children) {
    const filteredChildren = node.children
      .map(child => filterNodeByGitStatus(child, status, visited))
      .filter((child): child is TreeNode => child !== null);

    // Include folder if it has matching children
    // (folders themselves don't have meaningful git status)
    if (filteredChildren.length > 0) {
      return {
        ...cloneNode(node),
        children: filteredChildren,
      };
    }
  }

  // Folder has no matching children
  return null;
}

/**
 * Fuzzy match: checks if pattern characters appear in text in order.
 * Both text and pattern should be lowercase.
 *
 * @param text - Text to search in (should be lowercase)
 * @param pattern - Pattern to search for (should be lowercase)
 * @returns true if pattern matches text
 *
 * @example
 * matchesFuzzy('components', 'cmp') // true
 * matchesFuzzy('companymap', 'cmp') // true
 * matchesFuzzy('src/app.tsx', 'app') // true
 * matchesFuzzy('readme.md', 'read') // true
 * matchesFuzzy('test.ts', 'tsx') // false
 */
function matchesFuzzy(text: string, pattern: string): boolean {
  let patternIndex = 0;
  let textIndex = 0;

  while (patternIndex < pattern.length && textIndex < text.length) {
    if (pattern[patternIndex] === text[textIndex]) {
      patternIndex++;
    }
    textIndex++;
  }

  // Match successful if we found all pattern characters
  return patternIndex === pattern.length;
}

/**
 * Clone a TreeNode without its children.
 * Creates a shallow copy of the node.
 */
function cloneNode(node: TreeNode): TreeNode {
  const { children, ...rest } = node;
  return {
    ...rest,
    ...(node.modified ? { modified: new Date(node.modified.getTime()) } : {}),
    // children copied separately in filter functions
  };
}

/**
 * Deep clone a TreeNode with all its descendants.
 * Recursively clones the entire subtree.
 * Guards against circular references (e.g., symlinks).
 */
function deepCloneNode(node: TreeNode, visited: Set<string> = new Set()): TreeNode {
  // Prevent infinite recursion from circular references
  if (visited.has(node.path)) {
    return cloneNode(node); // Return shallow clone without children
  }

  visited.add(node.path);
  const cloned = cloneNode(node);

  if (node.children) {
    cloned.children = node.children.map(child => deepCloneNode(child, visited));
  }

  return cloned;
}
