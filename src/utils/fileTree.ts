import fs from 'fs-extra';
import path from 'path';
import type { TreeNode, YellowwoodConfig } from '../types/index.js';

/**
 * Build a file tree from the filesystem starting at rootPath.
 * Returns an array of root-level TreeNode objects with recursive children.
 *
 * @param rootPath - Absolute path to the root directory to scan
 * @param config - Yellowwood configuration for filtering and sorting
 * @returns Array of TreeNode objects representing the directory structure
 */
export async function buildFileTree(
  rootPath: string,
  config: YellowwoodConfig
): Promise<TreeNode[]> {
  // Validate root path
  try {
    const stat = await fs.stat(rootPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${rootPath}`);
    }
  } catch (error) {
    console.error(`Failed to access root path ${rootPath}:`, (error as Error).message);
    return [];
  }

  // Load gitignore patterns if needed
  const gitignorePatterns = config.respectGitignore
    ? await loadGitignorePatterns(rootPath)
    : [];

  // Build tree recursively
  const nodes = await buildTreeRecursive(rootPath, config, 0, gitignorePatterns, rootPath);

  return sortNodes(nodes, config);
}

/**
 * Recursively build tree nodes for a directory.
 * Internal helper - not exported.
 */
async function buildTreeRecursive(
  dirPath: string,
  config: YellowwoodConfig,
  currentDepth: number,
  gitignorePatterns: string[],
  rootPath: string
): Promise<TreeNode[]> {
  const nodes: TreeNode[] = [];

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    // Permission error or directory disappeared
    console.warn(`Cannot read directory ${dirPath}:`, (error as Error).message);
    return [];
  }

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    // Filter based on config and gitignore
    if (!shouldIncludeFile(entryPath, entry.name, config, gitignorePatterns, rootPath)) {
      continue;
    }

    try {
      // Create node with metadata
      const node = await createTreeNode(entryPath, entry.name, currentDepth);

      // Recursively build children for directories
      if (node.type === 'directory') {
        // Check depth limit
        const depthLimitReached = config.maxDepth !== null && currentDepth >= config.maxDepth;

        if (!depthLimitReached) {
          node.children = await buildTreeRecursive(
            entryPath,
            config,
            currentDepth + 1,
            gitignorePatterns,
            rootPath
          );
        } else {
          // At depth limit - no children
          node.children = [];
        }
      }

      nodes.push(node);
    } catch (error) {
      // Couldn't stat file or create node - skip it
      console.warn(`Skipping ${entryPath}:`, (error as Error).message);
      continue;
    }
  }

  return sortNodes(nodes, config);
}

/**
 * Create a TreeNode for a file or directory.
 * Gathers metadata (size, modified time) via fs.stat.
 */
async function createTreeNode(
  entryPath: string,
  entryName: string,
  currentDepth: number
): Promise<TreeNode> {
  // Use lstat to not follow symlinks
  const stat = await fs.lstat(entryPath);

  const node: TreeNode = {
    name: entryName,
    path: entryPath,
    type: stat.isDirectory() ? 'directory' : 'file',
    depth: currentDepth,
    expanded: false,
  };

  // Add optional metadata
  if (stat.isFile()) {
    node.size = stat.size;
  }

  node.modified = stat.mtime;

  // Initialize children array for directories
  if (node.type === 'directory') {
    node.children = [];
  }

  return node;
}

/**
 * Determine if a file should be included in the tree.
 * Checks hidden files, gitignore patterns, and custom ignore patterns.
 */
function shouldIncludeFile(
  filePath: string,
  fileName: string,
  config: YellowwoodConfig,
  gitignorePatterns: string[],
  rootPath: string
): boolean {
  // Hidden files (starts with '.')
  if (!config.showHidden && fileName.startsWith('.')) {
    // Exception: always include .git directory for git operations
    if (fileName === '.git') {
      return true;
    }
    return false;
  }

  // Compute relative path from root for pattern matching
  const relativePath = path.relative(rootPath, filePath);

  // Check gitignore patterns
  if (config.respectGitignore && gitignorePatterns.length > 0) {
    for (const pattern of gitignorePatterns) {
      // Match against both filename and relative path
      // This allows patterns like "node_modules/", "*.log", "build/*.js" to work correctly
      if (matchPattern(fileName, pattern) || matchPattern(relativePath, pattern)) {
        return false;
      }
    }
  }

  // Check custom ignore patterns
  if (config.customIgnores.length > 0) {
    for (const pattern of config.customIgnores) {
      // Match against both filename and relative path for consistency
      if (matchPattern(fileName, pattern) || matchPattern(relativePath, pattern)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Simple glob pattern matcher.
 * Supports * and ? wildcards.
 * For more complex patterns, consider using minimatch or globby.
 */
function matchPattern(filename: string, pattern: string): boolean {
  const normalizeToPosix = (value: string): string => {
    if (!value) {
      return '';
    }
    const withSlashes = value.replace(/\\/g, '/').replace(/\/+/g, '/');
    if (withSlashes === '/') {
      return '/';
    }
    return withSlashes.replace(/\/$/, '');
  };

  const normalizedFilename = normalizeToPosix(filename);
  let normalizedPattern = normalizeToPosix(pattern);

  const isDirectoryPattern = normalizedPattern.endsWith('/');
  if (isDirectoryPattern && normalizedPattern !== '/') {
    normalizedPattern = normalizedPattern.replace(/\/+$/, '');
  }

  // Escape all regex metacharacters EXCEPT * and ?, then expand glob wildcards
  const escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexPattern = escaped
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regexSource = isDirectoryPattern
    ? `^${regexPattern}(?:/.*)?$`
    : `^${regexPattern}$`;

  const regex = new RegExp(regexSource);
  return regex.test(normalizedFilename);
}

/**
 * Sort tree nodes according to config.
 * Directories always come before files.
 * Within each group, sort by configured field.
 */
function sortNodes(nodes: TreeNode[], config: YellowwoodConfig): TreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    // Directories first, always
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }

    // Within same type, sort by configured field
    let comparison = 0;
    switch (config.sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        break;
      case 'size':
        comparison = (a.size || 0) - (b.size || 0);
        break;
      case 'modified':
        const aTime = a.modified?.getTime() || 0;
        const bTime = b.modified?.getTime() || 0;
        comparison = aTime - bTime;
        break;
      case 'type':
        // Already sorted by type (directory vs file)
        // Secondary sort by name
        comparison = a.name.localeCompare(b.name);
        break;
      default:
        comparison = 0;
    }

    // Reverse if descending
    return config.sortDirection === 'desc' ? -comparison : comparison;
  });

  return sorted;
}

/**
 * Load and parse .gitignore files from the root directory.
 * Returns array of gitignore patterns.
 */
async function loadGitignorePatterns(rootPath: string): Promise<string[]> {
  const gitignorePath = path.join(rootPath, '.gitignore');

  try {
    const exists = await fs.pathExists(gitignorePath);
    if (!exists) {
      return [];
    }

    const contents = await fs.readFile(gitignorePath, 'utf-8');
    const lines = contents.split('\n');

    // Parse gitignore: remove comments, blank lines, trim whitespace
    const patterns = lines
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));

    return patterns;
  } catch (error) {
    console.warn(`Could not load .gitignore from ${gitignorePath}:`, (error as Error).message);
    return [];
  }
}
