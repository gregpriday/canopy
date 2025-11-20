import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';
import type { TreeNode, CanopyConfig } from '../types/index.js';
import { TreeNode as TreeNodeComponent } from './TreeNode.js';
import {
  flattenVisibleTree,
  calculateVisibleWindow,
  findNodeIndex,
  calculateScrollToNode,
} from '../utils/treeViewVirtualization.js';
import { useKeyboard } from '../hooks/useKeyboard.js';
import { useMouse } from '../hooks/useMouse.js';
import { useTerminalMouse } from '../hooks/useTerminalMouse.js';
import { useViewportHeight } from '../hooks/useViewportHeight.js';
import type { FlattenedNode } from '../utils/treeViewVirtualization.js';

interface TreeViewProps {
  fileTree: TreeNode[];
  selectedPath: string;
  onSelect: (path: string) => void;
  config: CanopyConfig;
  expandedPaths?: Set<string>; // Optional controlled expansion
  onToggleExpand?: (path: string) => void; // Callback for expansion changes
  disableKeyboard?: boolean; // Disable internal keyboard handlers when parent handles them
  disableMouse?: boolean; // Disable mouse interactions
  onCopyPath?: (path: string) => void; // Handler for copy action (mouse click)
}

export const TreeView: React.FC<TreeViewProps> = ({
  fileTree,
  selectedPath,
  onSelect,
  config,
  expandedPaths: controlledExpandedPaths,
  onToggleExpand,
  disableKeyboard = false,
  disableMouse = false,
  onCopyPath,
}) => {
  // Header (3) + StatusBar (4) = 7 reserved rows
  const viewportHeight = useViewportHeight(7);

  // Scroll state
  const [scrollOffset, setScrollOffset] = useState(0);

  // Track expanded folders (use controlled if provided, otherwise internal state)
  const [internalExpandedPaths, setInternalExpandedPaths] = useState<Set<string>>(new Set());
  const isControlledExpansion = controlledExpandedPaths != null && onToggleExpand != null;
  const expandedPaths = isControlledExpansion ? controlledExpandedPaths : internalExpandedPaths;

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
      if (isControlledExpansion) {
        onToggleExpand?.(node.path);
        return;
      }

      setInternalExpandedPaths((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(node.path)) {
          newSet.delete(node.path);
        } else {
          newSet.add(node.path);
        }
        return newSet;
      });
    }
  }, [cursorIndex, flattenedTree, isControlledExpansion, onToggleExpand]);

  const handleToggle = useCallback((path: string) => {
    if (isControlledExpansion) {
      onToggleExpand?.(path);
      return;
    }

    setInternalExpandedPaths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, [isControlledExpansion, onToggleExpand]);

  const handleNavigateLeft = useCallback(() => {
    const node = flattenedTree[cursorIndex];
    if (!node) return;

    if (node.type === 'directory' && node.expanded) {
      // Collapse current folder
      handleToggle(node.path);
    } else if (node.depth > 0) {
      // Move to parent folder
      // Find parent by walking backwards to find a node with depth one less
      const targetDepth = node.depth - 1;
      for (let i = cursorIndex - 1; i >= 0; i--) {
        if (flattenedTree[i].depth === targetDepth) {
          onSelect(flattenedTree[i].path);
          return;
        }
      }
    }
  }, [cursorIndex, flattenedTree, handleToggle, onSelect]);

  const handleNavigateRight = useCallback(() => {
    const node = flattenedTree[cursorIndex];
    if (!node) return;

    if (node.type === 'directory') {
      if (!node.expanded) {
        // Expand current folder
        handleToggle(node.path);
      } else if (node.children && node.children.length > 0) {
        // Move to first child (which is the next node in flattened tree)
        const nextIndex = cursorIndex + 1;
        if (flattenedTree[nextIndex]) {
          onSelect(flattenedTree[nextIndex].path);
        }
      }
    }
  }, [cursorIndex, flattenedTree, handleToggle, onSelect]);

  const handleOpenFile = useCallback(() => {
    const node = flattenedTree[cursorIndex];
    if (!node) return;

    if (node.type === 'file') {
      onSelect(node.path); // For now, opening a file = selecting it
    } else {
      // For directories, toggle expansion
      handleToggle(node.path);
    }
  }, [cursorIndex, flattenedTree, handleToggle, onSelect]);

  const handleScrollChange = useCallback((newOffset: number) => {
    setScrollOffset(newOffset);
  }, []);

  // Wire up keyboard navigation (only if not disabled)
  useKeyboard(disableKeyboard ? {} : {
    onNavigateUp: handleNavigateUp,
    onNavigateDown: handleNavigateDown,
    onNavigateLeft: handleNavigateLeft,
    onNavigateRight: handleNavigateRight,
    onPageUp: handlePageUp,
    onPageDown: handlePageDown,
    onHome: handleHome,
    onEnd: handleEnd,
    onOpenFile: handleOpenFile,
    onToggleExpand: handleToggleExpand,
  });

  // Calculate header offset for mouse interaction
  // Header is 3 rows (border + content + border)
  // Plus 1 row if top scroll indicator is visible
  const headerOffset = 3 + (visibleWindow.scrolledPast > 0 ? 1 : 0);

  // Wire up mouse navigation
  const { handleClick, handleScroll } = useMouse({
    fileTree: flattenedTree,
    selectedPath,
    scrollOffset,
    viewportHeight,
    headerHeight: headerOffset,
    onSelect,
    onToggle: handleToggle,
    onOpen: onSelect, // For now, open = select
    onCopy: onCopyPath,
    onContextMenu: () => {}, // Not implemented yet
    onScrollChange: handleScrollChange,
    config,
  });

  // Listen for raw terminal mouse events
  useTerminalMouse({
    enabled: !disableMouse,
    onMouse: (termEvent) => {
      // Map terminal event to internal logic event
      if (termEvent.button === 'wheel-up') {
        handleScroll({ x: termEvent.x, y: termEvent.y, deltaY: -1 });
      } else if (termEvent.button === 'wheel-down') {
        handleScroll({ x: termEvent.x, y: termEvent.y, deltaY: 1 });
      } else if (termEvent.action === 'down') {
        // Convert simplified button names
        const buttonMap: Record<string, 'left' | 'right' | 'middle'> = {
          'left': 'left', 'right': 'right', 'middle': 'middle'
        };
        
        if (buttonMap[termEvent.button]) {
          handleClick({
            x: termEvent.x, 
            y: termEvent.y,
            button: buttonMap[termEvent.button],
            shift: termEvent.shift,
            ctrl: termEvent.ctrl,
            meta: termEvent.alt
          });
        }
      }
    }
  });

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
