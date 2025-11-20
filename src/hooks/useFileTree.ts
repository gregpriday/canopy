import { useState, useEffect, useMemo, useRef } from 'react';
import type { TreeNode, CanopyConfig, GitStatus } from '../types/index.js';
import { buildFileTree } from '../utils/fileTree.js';
import { filterTreeByName, filterTreeByGitStatus } from '../utils/filter.js';
import { events } from '../services/events.js'; // Import event bus
import {
  createFlattenedTree,
  moveSelection,
  jumpToStart,
  jumpToEnd,
  getCurrentNode,
  getRightArrowAction,
  getLeftArrowAction,
  findNodeInTree,
  getParentPath,
} from '../utils/treeNavigation.js';

export interface UseFileTreeOptions {
  rootPath: string;
  config: CanopyConfig;
  filterQuery?: string | null;
  gitStatusMap?: Map<string, GitStatus>;
  gitStatusFilter?: GitStatus | GitStatus[] | null;
  initialSelectedPath?: string | null;
  initialExpandedFolders?: Set<string>;
  viewportHeight: number; // Added
}

export interface UseFileTreeResult {
  tree: TreeNode[];
  rawTree: TreeNode[]; // Unfiltered tree (for commands)
  expandedFolders: Set<string>;
  selectedPath: string | null;
  loading: boolean;
}

/**
 * Custom hook for managing file tree state.
 *
 * Handles:
 * - Loading tree from filesystem
 * - Expansion/collapse state
 * - Selection state
 * - Filter integration
 * - Git status integration
 * - Navigation via event bus
 *
 * @param options - Configuration options
 * @returns Tree state and actions
 */
export function useFileTree(options: UseFileTreeOptions): UseFileTreeResult {
  const { rootPath, config, filterQuery, gitStatusMap, gitStatusFilter, initialSelectedPath, initialExpandedFolders, viewportHeight } = options;

  // Internal State
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(initialExpandedFolders || new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(initialSelectedPath || null);
  const [loading, setLoading] = useState<boolean>(true);
  const initialStateSignatureRef = useRef<string | null>(null);
  const selectedPathRef = useRef<string | null>(selectedPath);

  // Ref to track refresh cancellation and initial load
  const refreshIdRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  // --- Internal Actions (triggered by events) ---

  const selectPath = (path: string | null) => {
    setSelectedPath(path);
  };

  const expandFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  };

  const collapseFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const refreshTree = async () => {
    const currentRefreshId = ++refreshIdRef.current;
    try {
      const newTree = await buildFileTree(rootPath, config, true);
      if (currentRefreshId === refreshIdRef.current) {
        setTree([...newTree]);
        setLoading(false);
      }
    } catch (error) {
      console.error('Failed to refresh tree:', error);
      if (currentRefreshId === refreshIdRef.current) {
        setLoading(false);
      }
    }
  };


  // Build initial tree when rootPath or config changes
  useEffect(() => {
    let cancelled = false;

    async function loadTree() {
      setLoading(true);
      if (!isInitialLoadRef.current) {
        setSelectedPath(null);
        setExpandedFolders(new Set());
      }
      isInitialLoadRef.current = false;

      try {
        const newTree = await buildFileTree(rootPath, config);
        if (!cancelled) {
          setTree(newTree);
          setLoading(false);
        }
      } catch (error) {
        console.error('Failed to build file tree:', error);
        if (!cancelled) {
          setTree([]);
          setLoading(false);
        }
      }
    }

    loadTree();

    return () => {
      cancelled = true;
    };
  }, [rootPath, config]);

  useEffect(() => {
    const hasInitialSelection = Boolean(initialSelectedPath);
    const hasInitialExpanded = Boolean(initialExpandedFolders && initialExpandedFolders.size > 0);

    if (!hasInitialSelection && !hasInitialExpanded) {
      return;
    }

    const expandedSignature = initialExpandedFolders
      ? Array.from(initialExpandedFolders).sort().join(',')
      : '';
    const signature = `${initialSelectedPath || ''}|${expandedSignature}`;

    if (initialStateSignatureRef.current === signature) {
      return;
    }

    setSelectedPath(initialSelectedPath || null);
    setExpandedFolders(initialExpandedFolders ? new Set(initialExpandedFolders) : new Set());
    initialStateSignatureRef.current = signature;
  }, [initialSelectedPath, initialExpandedFolders]);

  const gitStatusSignature = useMemo(
    () => (gitStatusMap ? Array.from(gitStatusMap.entries()).sort((a, b) => a[0].localeCompare(b[0])) : []),
    [gitStatusMap]
  );

  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);

  const treeWithGitStatus = useMemo(() => {
    if (!gitStatusMap || gitStatusMap.size === 0) {
      return tree;
    }

    function processNodeWithStatus(node: TreeNode): { node: TreeNode; count: number } {
      const gitStatus = gitStatusMap?.get(node.path);
      
      const selfCount = gitStatus ? 1 : 0;
      
      let childSum = 0;
      let newChildren: TreeNode[] | undefined;

      if (node.children) {
        newChildren = [];
        for (const child of node.children) {
          const { node: processedChild, count } = processNodeWithStatus(child);
          newChildren.push(processedChild);
          childSum += count;
        }
      }

      const totalCount = selfCount + childSum;

      const updatedNode: TreeNode = {
        ...node,
        gitStatus,
        children: newChildren,
        recursiveGitCount: totalCount,
      };

      return { node: updatedNode, count: totalCount };
    }

    return tree.map(node => processNodeWithStatus(node).node);
  }, [tree, gitStatusMap, gitStatusSignature]);

  const filteredTree = useMemo(() => {
    let result = treeWithGitStatus;

    if (gitStatusFilter) {
      try {
        result = filterTreeByGitStatus(result, gitStatusFilter);
      } catch (error) {
        console.warn('Git status filter error:', error);
        result = treeWithGitStatus;
      }
    }

    if (filterQuery) {
      try {
        result = filterTreeByName(result, filterQuery);
      } catch (error) {
        console.warn('Name filter error:', error);
      }
    }

    return result;
  }, [treeWithGitStatus, filterQuery, gitStatusFilter]);

  // Create flattened tree for navigation
  const flattenedTree = useMemo(
    () => createFlattenedTree(filteredTree, expandedFolders),
    [filteredTree, expandedFolders]
  );

  // --- Validate selection after tree changes ---
  // When the tree is rebuilt (e.g., file watcher triggers refresh), ensure the
  // selected path still exists. If not, move to parent → sibling → root fallback.
  useEffect(() => {
    // Skip validation during initial load or if no selection exists
    if (loading || !selectedPath) {
      return;
    }

    // Handle empty tree case: clear selection
    if (tree.length === 0) {
      setSelectedPath(null);
      return;
    }

    // Check if current selection still exists in the new tree
    const selectionExists = findNodeInTree(tree, selectedPath);

    if (!selectionExists) {
      // Strategy A: Try to select the parent directory
      const parentPath = getParentPath(selectedPath);

      if (parentPath && findNodeInTree(tree, parentPath)) {
        // Parent exists, move selection there
        setSelectedPath(parentPath);
      } else {
        // Strategy B: Fall back to root if parent is also gone
        // Try to use rootPath first, then fall back to first node
        if (findNodeInTree(tree, rootPath)) {
          setSelectedPath(rootPath);
        } else if (tree.length > 0) {
          setSelectedPath(tree[0].path);
        } else {
          // Tree became empty, clear selection
          setSelectedPath(null);
        }
      }
    }
  }, [tree, selectedPath, rootPath, loading]);

  // --- Event Listeners for Navigation, Selection, Expansion ---
  useEffect(() => {
    const unsubscribes = [
      events.on('nav:select', (payload) => {
        selectPath(payload.path);
      }),
      events.on('nav:expand', (payload) => {
        expandFolder(payload.path);
      }),
      events.on('nav:collapse', (payload) => {
        collapseFolder(payload.path);
      }),
      events.on('nav:move', (payload) => {
        if (flattenedTree.length === 0) return;

        let newPath: string | null = null;
        const currentSelectedPath = selectedPath || '';

        switch (payload.direction) {
          case 'up':
            newPath = moveSelection(flattenedTree, currentSelectedPath, -1);
            break;
          case 'down':
            newPath = moveSelection(flattenedTree, currentSelectedPath, 1);
            break;
          case 'left': {
            const currentNode = getCurrentNode(flattenedTree, currentSelectedPath);
            const action = getLeftArrowAction(currentNode, flattenedTree, expandedFolders);
            if (action.type === 'collapse' && action.path) {
              collapseFolder(action.path);
            } else if (action.type === 'parent' && action.path) {
              newPath = action.path;
            }
            break;
          }
          case 'right': {
            const currentNode = getCurrentNode(flattenedTree, currentSelectedPath);
            const action = getRightArrowAction(currentNode, expandedFolders);
            if (action === 'expand' && currentNode) {
              expandFolder(currentNode.path);
            } else if (action === 'open' && currentNode) {
              events.emit('file:open', { path: currentNode.path });
            }
            break;
          }
          case 'pageUp':
            newPath = moveSelection(flattenedTree, currentSelectedPath, -viewportHeight);
            break;
          case 'pageDown':
            newPath = moveSelection(flattenedTree, currentSelectedPath, viewportHeight);
            break;
          case 'home':
            newPath = jumpToStart(flattenedTree);
            break;
          case 'end':
            newPath = jumpToEnd(flattenedTree);
            break;
        }

        if (newPath) {
          selectPath(newPath);
        }
      }),
      events.on('nav:toggle-expand', ({ path }) => {
        if (expandedFolders.has(path)) {
          collapseFolder(path);
        } else {
          expandFolder(path);
        }
      }),
      events.on('nav:primary', () => {
        const path = selectedPathRef.current;
        if (!path) return;
        const currentNode = getCurrentNode(flattenedTree, path);
        if (!currentNode) return;

        if (currentNode.type === 'directory') {
          if (expandedFolders.has(currentNode.path)) {
            collapseFolder(currentNode.path);
          } else {
            expandFolder(currentNode.path);
          }
        } else {
          events.emit('file:open', { path: currentNode.path });
        }
      }),
    ];

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [flattenedTree, selectedPath, expandedFolders, viewportHeight]);

  // --- Event Listener for Refresh ---
  useEffect(() => {
    return events.on('sys:refresh', () => {
      refreshTree();
    });
  }, [rootPath, config]); // refreshTree depends on rootPath and config

  return {
    tree: filteredTree,
    rawTree: treeWithGitStatus, // Unfiltered but with git status
    expandedFolders,
    selectedPath,
    loading,
  };
}
