import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { TreeNode, CanopyConfig, GitStatus } from '../types/index.js';
import { buildFileTree } from '../utils/fileTree.js';
import { filterTreeByName, filterTreeByGitStatus } from '../utils/filter.js';
import { trace } from '../utils/runtimeLogger.js';

export interface UseFileTreeOptions {
  rootPath: string;
  config: CanopyConfig;
  filterQuery?: string | null;
  gitStatusMap?: Map<string, GitStatus>;
  gitStatusFilter?: GitStatus | GitStatus[] | null;
  initialSelectedPath?: string | null;
  initialExpandedFolders?: Set<string>;
}

export interface UseFileTreeResult {
  tree: TreeNode[];
  rawTree: TreeNode[]; // Unfiltered tree (for commands)
  expandedFolders: Set<string>;
  selectedPath: string | null;
  loading: boolean;
  expandFolder: (path: string) => void;
  collapseFolder: (path: string) => void;
  toggleFolder: (path: string) => void;
  selectPath: (path: string | null) => void;
  refresh: () => Promise<void>;
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
 *
 * @param options - Configuration options
 * @returns Tree state and actions
 */
export function useFileTree(options: UseFileTreeOptions): UseFileTreeResult {
  const { rootPath, config, filterQuery, gitStatusMap, gitStatusFilter, initialSelectedPath, initialExpandedFolders } = options;

  // State
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(initialExpandedFolders || new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(initialSelectedPath || null);
  const [loading, setLoading] = useState<boolean>(true);
  const initialStateSignatureRef = useRef<string | null>(null);

  // Ref to track refresh cancellation and initial load
  const refreshIdRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  // Build initial tree when rootPath or config changes
  useEffect(() => {
    let cancelled = false;

    async function loadTree() {
      setLoading(true);
      // Clear selection and expansion when rootPath changes (worktree switch)
      // But preserve them on initial load to allow state restoration
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
          setTree([]); // Empty tree on error
          setLoading(false);
        }
      }
    }

    loadTree();

    // Cleanup: cancel if component unmounts or dependencies change
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

  // Apply git status to tree nodes when gitStatusMap changes
  // Convert Map to stable array for dependency tracking (Map reference doesn't change when mutated)
  const gitStatusSignature = useMemo(
    () => (gitStatusMap ? Array.from(gitStatusMap.entries()).sort((a, b) => a[0].localeCompare(b[0])) : []),
    [gitStatusMap]
  );

  const treeWithGitStatus = useMemo(() => {
    if (!gitStatusMap || gitStatusMap.size === 0) {
      return tree;
    }

    // Recursively attach git status to nodes
    function attachGitStatus(nodes: TreeNode[]): TreeNode[] {
      return nodes.map(node => {
        const gitStatus = gitStatusMap?.get(node.path);
        const updatedNode: TreeNode = {
          ...node,
          gitStatus,
          children: node.children ? attachGitStatus(node.children) : undefined,
        };
        return updatedNode;
      });
    }

    return attachGitStatus(tree);
  }, [tree, gitStatusMap, gitStatusSignature]);

  // Apply filters to tree (git status filter first, then name filter)
  const filteredTree = useMemo(() => {
    let result = treeWithGitStatus;

    // Apply git status filter first
    if (gitStatusFilter) {
      try {
        result = filterTreeByGitStatus(result, gitStatusFilter);
      } catch (error) {
        console.warn('Git status filter error:', error);
        result = treeWithGitStatus; // Return unfiltered on error
      }
    }

    // Apply name filter second
    if (filterQuery) {
      try {
        result = filterTreeByName(result, filterQuery);
      } catch (error) {
        console.warn('Name filter error:', error);
        // If name filter fails, return git-filtered tree (don't apply name filter)
      }
    }

    return result;
  }, [treeWithGitStatus, filterQuery, gitStatusFilter]);

  // Expansion actions
  const expandFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  const collapseFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Selection action
  const selectPath = useCallback((path: string | null) => {
    setSelectedPath(path);
  }, []);

  // Refresh action
  const refresh = useCallback(async () => {
    trace('useFileTree', 'refresh() called', { rootPath });
    // 1. Increment ID to track this specific request
    const currentRefreshId = ++refreshIdRef.current;

    // 2. DO NOT set loading to true (this causes flicker and might block UI updates)
    // setLoading(true);

    try {
      // 3. FORCE refresh is strictly TRUE here
      trace('useFileTree', 'Calling buildFileTree with forceRefresh=true');
      const newTree = await buildFileTree(rootPath, config, true);
      trace('useFileTree', 'buildFileTree returned', { treeLength: newTree.length });

      // 4. Safety check: only update if this is still the latest request
      if (currentRefreshId === refreshIdRef.current) {
        trace('useFileTree', 'Setting tree state (refreshId valid)');

        // 5. FORCE update by creating a new array reference
        setTree([...newTree]);

        setLoading(false);
      } else {
        trace('useFileTree', 'Skipping tree update (stale refreshId)', {
          currentRefreshId,
          latestRefreshId: refreshIdRef.current,
        });
      }
    } catch (error) {
      trace('useFileTree', 'refresh() failed', { error: error instanceof Error ? error.message : String(error) });
      console.error('Failed to refresh tree:', error);
      if (currentRefreshId === refreshIdRef.current) {
        setLoading(false);
      }
    }
  }, [rootPath, config]);

  return {
    tree: filteredTree,
    rawTree: treeWithGitStatus, // Unfiltered but with git status
    expandedFolders,
    selectedPath,
    loading,
    expandFolder,
    collapseFolder,
    toggleFolder,
    selectPath,
    refresh,
  };
}
