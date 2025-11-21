/**
 * Path ancestry utilities for detecting active paths in the tree
 */

const normalizePath = (path: string): string => {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
};

const isAncestorNormalized = (ancestorPath: string, descendantPath: string): boolean => {
  if (ancestorPath === descendantPath) return false;

  if (ancestorPath === '/') {
    return descendantPath !== '/' && descendantPath.startsWith('/');
  }

  return descendantPath.startsWith(`${ancestorPath}/`);
};

/**
 * Check if ancestorPath is an ancestor of descendantPath
 *
 * @example
 * isAncestor('/src', '/src/components/FileNode.tsx') // true
 * isAncestor('/src/components', '/src/utils/config.ts') // false
 */
export function isAncestor(ancestorPath: string, descendantPath: string): boolean {
  return isAncestorNormalized(
    normalizePath(ancestorPath),
    normalizePath(descendantPath)
  );
}

/**
 * Get parent path of a file or folder
 *
 * @example
 * getParentPath('/src/components/FileNode.tsx') // '/src/components'
 * getParentPath('/src') // '/'
 */
export function getParentPath(path: string): string {
  const normalized = path.replace(/\/$/, '');
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash <= 0) return '/';
  return normalized.substring(0, lastSlash);
}

/**
 * Check if node is on the active path to selected file
 */
export function isOnActivePath(nodePath: string, selectedPath: string | null): boolean {
  if (!selectedPath) return false;

  const normalizedNode = normalizePath(nodePath);
  const normalizedSelected = normalizePath(selectedPath);

  return normalizedNode === normalizedSelected
    || isAncestorNormalized(normalizedNode, normalizedSelected);
}
