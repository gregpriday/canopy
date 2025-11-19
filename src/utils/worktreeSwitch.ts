import path from 'path';
import type { Worktree, TreeNode, CanopyConfig } from '../types/index.js';
import { buildFileTree } from './fileTree.js';
import { createFileWatcher, type FileWatcher } from './fileWatcher.js';

export interface SwitchWorktreeOptions {
  /** Target worktree to switch to */
  targetWorktree: Worktree;

  /** Current file watcher (null if none active) */
  currentWatcher: FileWatcher | null;

  /** Current file tree (used for selection preservation) */
  currentTree: TreeNode[];

  /** Currently selected path (absolute or relative) */
  selectedPath: string | null;

  /** Application configuration */
  config: CanopyConfig;

  /** Callback for file change events */
  onFileChange: {
    onAdd?: (path: string) => void;
    onChange?: (path: string) => void;
    onUnlink?: (path: string) => void;
    onAddDir?: (path: string) => void;
    onUnlinkDir?: (path: string) => void;
  };

  /** Disable file watching (from CLI --no-watch flag) */
  noWatch?: boolean;

  /** Initial filter pattern to apply (from CLI --filter flag) */
  initialFilter?: string;
}

export interface SwitchWorktreeResult {
  /** New file tree for target worktree */
  tree: TreeNode[];

  /** New file watcher instance */
  watcher: FileWatcher;

  /** Selected path in new tree (preserved if exists, null otherwise) */
  selectedPath: string | null;
}

/**
 * Switch from current worktree to target worktree.
 * Stops the current file watcher, builds a new tree, and starts a new watcher.
 * Attempts to preserve the selected file if it exists in the new worktree.
 *
 * @param options - Switching options
 * @returns New tree, watcher, and selected path
 */
export async function switchWorktree(options: SwitchWorktreeOptions): Promise<SwitchWorktreeResult> {
  const {
    targetWorktree,
    currentWatcher,
    selectedPath,
    config,
    onFileChange,
    noWatch = false,
    initialFilter,
  } = options;

  // Step 1: Stop the current watcher cleanly
  if (currentWatcher) {
    await currentWatcher.stop();
    // Watcher is now stopped, no more events will fire
  }

  // Step 2: Build file tree for the new worktree
  let newTree = await buildFileTree(targetWorktree.path, config);

  // Step 2.5: Apply initial filter if provided
  if (initialFilter) {
    // Import filter utility dynamically to avoid circular deps
    const { filterTreeByName } = await import('./filter.js');
    newTree = filterTreeByName(newTree, initialFilter);
  }

  // Step 3: Attempt to preserve selection
  let newSelectedPath: string | null = null;
  if (selectedPath) {
    // Try to find the same path in the new tree
    // Normalize the selected path to handle both absolute and relative paths
    const normalizedSelected = path.normalize(selectedPath);
    const pathExists = findPathInTree(newTree, normalizedSelected, targetWorktree.path);
    if (pathExists) {
      newSelectedPath = selectedPath;
    }
    // If path doesn't exist in new worktree, selection is cleared (null)
  }

  // Step 4: Start watcher for the new worktree (unless noWatch is true)
  const newWatcher = noWatch
    ? createNullWatcher() // Create a no-op watcher when watching is disabled
    : createFileWatcher(targetWorktree.path, {
        debounce: config.refreshDebounce,
        ignored: config.respectGitignore ? ['**/.git/**', '**/node_modules/**'] : [],
        ...onFileChange,
      });

  // Start the watcher immediately (no-op if noWatch)
  if (!noWatch) {
    newWatcher.start();
  }

  // Step 5: Return everything caller needs
  return {
    tree: newTree,
    watcher: newWatcher,
    selectedPath: newSelectedPath,
  };
}

/**
 * Check if a path exists in the tree (helper for selection preservation).
 * Uses normalized path comparison to avoid false positives from suffix matching.
 *
 * @param tree - Tree nodes to search
 * @param targetPath - Path to find (can be absolute or relative)
 * @param worktreeRoot - Root path of the worktree for relative path resolution
 * @returns true if path exists in tree
 */
function findPathInTree(tree: TreeNode[], targetPath: string, worktreeRoot: string): boolean {
  // Normalize target path for consistent comparison
  const normalizedTarget = path.normalize(targetPath);

  for (const node of tree) {
    // Normalize node path
    const normalizedNode = path.normalize(node.path);

    // Direct match (both absolute paths)
    if (normalizedNode === normalizedTarget) {
      return true;
    }

    // Try matching as relative path from worktree root
    // This handles case where targetPath is relative but node.path is absolute
    const nodeRelative = path.relative(worktreeRoot, normalizedNode);
    const targetRelative = path.isAbsolute(normalizedTarget)
      ? path.relative(worktreeRoot, normalizedTarget)
      : normalizedTarget;

    if (nodeRelative === targetRelative) {
      return true;
    }

    // Also check if the target is a relative path that matches the end of the node path
    // But only if it respects path segment boundaries (prevents false positives)
    if (!path.isAbsolute(normalizedTarget)) {
      const nodeSegments = normalizedNode.split(path.sep);
      const targetSegments = normalizedTarget.split(path.sep);

      // Check if target segments match the end of node segments
      if (targetSegments.length <= nodeSegments.length) {
        const nodeEnd = nodeSegments.slice(-targetSegments.length);
        const segmentsMatch = targetSegments.every((seg, idx) => seg === nodeEnd[idx]);
        if (segmentsMatch) {
          return true;
        }
      }
    }

    // Recursively check children
    if (node.children && node.children.length > 0) {
      if (findPathInTree(node.children, targetPath, worktreeRoot)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Create a no-op file watcher for when --no-watch is enabled.
 * Returns a FileWatcher interface with methods that do nothing.
 */
function createNullWatcher(): FileWatcher {
  return {
    start: () => {},
    stop: async () => {},
    isWatching: () => false,
  };
}
