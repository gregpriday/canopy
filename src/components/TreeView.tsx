import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { TreeNode, YellowwoodConfig } from '../types/index.js';
import { TreeNode as TreeNodeComponent } from './TreeNode.js';
import {
  flattenVisibleTree,
  calculateVisibleWindow,
  calculateViewportHeight,
  findNodeIndex,
  calculateScrollToNode,
} from '../utils/treeViewVirtualization.js';
import { useKeyboard } from '../hooks/useKeyboard.js';
import { useMouse } from '../hooks/useMouse.js';
import type { FlattenedNode } from '../utils/treeViewVirtualization.js';

interface TreeViewProps {
  fileTree: TreeNode[];
  selectedPath: string;
  onSelect: (path: string) => void;
  config: YellowwoodConfig;
}

export const TreeView: React.FC<TreeViewProps> = ({
  fileTree,
  selectedPath,
  onSelect,
  config
}) => {
  const { stdout } = useStdout();

  // Viewport state
  const [viewportHeight, setViewportHeight] = useState(() => calculateViewportHeight());
  const [scrollOffset, setScrollOffset] = useState(0);

  // Track expanded folders
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Update viewport height on terminal resize
  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(calculateViewportHeight());
    };

    if (stdout) {
      stdout.on('resize', handleResize);
      return () => {
        stdout.off('resize', handleResize);
      };
    }
  }, [stdout]);

  // Flatten the tree (memoized - only recalculate when tree structure or expansion changes)
  const flattenedTree = useMemo<FlattenedNode[]>(() => {
    // Mark nodes as expanded based on our state
    const markExpanded = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map((node) => ({
        ...node,
        expanded: expandedPaths.has(node.path) || node.expanded || false,
        children: node.children ? markExpanded(node.children) : undefined,
      }));
    };

    const markedTree = markExpanded(fileTree);
    return flattenVisibleTree(markedTree);
  }, [fileTree, expandedPaths]);

  // Find cursor index based on selected path
  const cursorIndex = useMemo(() => {
    const index = findNodeIndex(flattenedTree, selectedPath);
    return index >= 0 ? index : 0;
  }, [flattenedTree, selectedPath]);

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    const newScrollOffset = calculateScrollToNode(
      cursorIndex,
      scrollOffset,
      viewportHeight
    );
    if (newScrollOffset !== scrollOffset) {
      setScrollOffset(newScrollOffset);
    }
  }, [cursorIndex, scrollOffset, viewportHeight]);

  // Calculate visible window (memoized)
  const visibleWindow = useMemo(() => {
    return calculateVisibleWindow(flattenedTree, scrollOffset, viewportHeight);
  }, [flattenedTree, scrollOffset, viewportHeight]);

  // Navigation handlers
  const handleNavigateUp = useCallback(() => {
    const newIndex = Math.max(0, cursorIndex - 1);
    if (flattenedTree[newIndex]) {
      onSelect(flattenedTree[newIndex].path);
    }
  }, [cursorIndex, flattenedTree, onSelect]);

  const handleNavigateDown = useCallback(() => {
    const newIndex = Math.min(flattenedTree.length - 1, cursorIndex + 1);
    if (flattenedTree[newIndex]) {
      onSelect(flattenedTree[newIndex].path);
    }
  }, [cursorIndex, flattenedTree, onSelect]);

  const handlePageUp = useCallback(() => {
    const newIndex = Math.max(0, cursorIndex - viewportHeight);
    if (flattenedTree[newIndex]) {
      onSelect(flattenedTree[newIndex].path);
    }
  }, [cursorIndex, viewportHeight, flattenedTree, onSelect]);

  const handlePageDown = useCallback(() => {
    const newIndex = Math.min(flattenedTree.length - 1, cursorIndex + viewportHeight);
    if (flattenedTree[newIndex]) {
      onSelect(flattenedTree[newIndex].path);
    }
  }, [cursorIndex, viewportHeight, flattenedTree, onSelect]);

  const handleHome = useCallback(() => {
    if (flattenedTree[0]) {
      onSelect(flattenedTree[0].path);
    }
  }, [flattenedTree, onSelect]);

  const handleEnd = useCallback(() => {
    const lastIndex = flattenedTree.length - 1;
    if (flattenedTree[lastIndex]) {
      onSelect(flattenedTree[lastIndex].path);
    }
  }, [flattenedTree, onSelect]);

  const handleToggleExpand = useCallback(() => {
    const node = flattenedTree[cursorIndex];
    if (node && node.type === 'directory') {
      setExpandedPaths((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(node.path)) {
          newSet.delete(node.path);
        } else {
          newSet.add(node.path);
        }
        return newSet;
      });
    }
  }, [cursorIndex, flattenedTree]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, []);

  const handleScrollChange = useCallback((newOffset: number) => {
    setScrollOffset(newOffset);
  }, []);

  // Wire up keyboard navigation
  useKeyboard({
    onNavigateUp: handleNavigateUp,
    onNavigateDown: handleNavigateDown,
    onPageUp: handlePageUp,
    onPageDown: handlePageDown,
    onHome: handleHome,
    onEnd: handleEnd,
    onToggleExpand: handleToggleExpand,
  });

  // Wire up mouse navigation (prepared for future mouse event integration)
  // Note: Actual mouse event handling requires terminal escape sequence parsing
  // which is beyond the scope of windowed rendering. The handlers are ready
  // for when mouse support is fully implemented.
  const { handleClick, handleScroll } = useMouse({
    fileTree: flattenedTree,
    selectedPath,
    scrollOffset,
    viewportHeight,
    headerHeight: 2, // Header is 2 rows
    onSelect,
    onToggle: handleToggle,
    onOpen: onSelect, // For now, open = select
    onContextMenu: () => {}, // Not implemented yet
    onScrollChange: handleScrollChange,
    config,
  });

  // Silence unused variable warnings - these will be used when mouse events are wired up
  void handleClick;
  void handleScroll;

  // Handle empty tree
  if (fileTree.length === 0) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text dimColor>No files to display</Text>
      </Box>
    );
  }

  // Render visible nodes only
  return (
    <Box
      flexDirection="column"
      paddingX={1}
    >
      {/* Scroll indicator - top */}
      {visibleWindow.scrolledPast > 0 && (
        <Box>
          <Text dimColor>▲ {visibleWindow.scrolledPast} more above</Text>
        </Box>
      )}

      {/* Visible nodes */}
      {visibleWindow.nodes.map((node) => (
        <TreeNodeComponent
          key={node.path}
          node={node}
          selected={node.path === selectedPath}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onToggle={handleToggle}
          config={config}
        />
      ))}

      {/* Scroll indicator - bottom */}
      {visibleWindow.remaining > 0 && (
        <Box>
          <Text dimColor>▼ {visibleWindow.remaining} more below</Text>
        </Box>
      )}
    </Box>
  );
};
