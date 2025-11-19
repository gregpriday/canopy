import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { TreeNode, YellowwoodConfig, GitStatus } from '../types/index.js';
import { buildFileTree } from '../utils/fileTree.js';
import { filterTreeByName } from '../utils/filter.js';

export interface UseFileTreeOptions {
  rootPath: string;
  config: YellowwoodConfig;
  filterQuery?: string | null;
  gitStatusMap?: Map<string, GitStatus>;
}

export interface UseFileTreeResult {
  tree: TreeNode[];
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
  const { rootPath, config, filterQuery, gitStatusMap } = options;

  // State
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Ref to track refresh cancellation
  const refreshIdRef = useRef(0);

  // Build initial tree when rootPath or config changes
  useEffect(() => {
    let cancelled = false;

    async function loadTree() {
      setLoading(true);
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

  // Apply git status to tree nodes when gitStatusMap changes
  // Convert Map to stable array for dependency tracking (Map reference doesn't change when mutated)
  const gitStatusSignature = useMemo(
    () => (gitStatusMap ? Array.from(gitStatusMap.entries()) : []),
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
  }, [tree, gitStatusSignature]);

  // Apply filter to tree when filterQuery changes
  const filteredTree = useMemo(() => {
    if (!filterQuery) {
      return treeWithGitStatus;
    }

    try {
      return filterTreeByName(treeWithGitStatus, filterQuery);
    } catch (error) {
      console.warn('Filter error:', error);
      return treeWithGitStatus; // Return unfiltered on error
    }
  }, [treeWithGitStatus, filterQuery]);

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
    // Increment refresh ID to invalidate any in-flight refreshes
    const currentRefreshId = ++refreshIdRef.current;

    setLoading(true);
    try {
      const newTree = await buildFileTree(rootPath, config);

      // Only update state if this is still the latest refresh
      if (currentRefreshId === refreshIdRef.current) {
        setTree(newTree);
        setLoading(false);
      }
    } catch (error) {
      console.error('Failed to refresh tree:', error);

      // Only update state if this is still the latest refresh
      if (currentRefreshId === refreshIdRef.current) {
        setTree([]);
        setLoading(false);
      }
    }
  }, [rootPath, config]);

  return {
    tree: filteredTree,
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
