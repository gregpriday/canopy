import { useCallback } from 'react';
import type { TreeNode, YellowwoodConfig } from '../types/index.js';

/**
 * Ink's mouse event types (from Ink 6.5).
 * These are the events provided by Ink's Box component.
 */
interface MouseEvent {
  x: number; // Column (0-based)
  y: number; // Row (0-based)
  button: 'left' | 'right' | 'middle';
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
}

interface ScrollEvent {
  x: number;
  y: number;
  deltaY: number; // Scroll amount (positive = down, negative = up)
}

export interface UseMouseOptions {
  fileTree: TreeNode[]; // Flattened tree (visible rows)
  selectedPath: string | null;
  scrollOffset: number; // Current scroll position
  viewportHeight: number; // Visible rows
  headerHeight: number; // Rows before tree starts (Header component)
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onContextMenu: (path: string, position: { x: number; y: number }) => void;
  onScrollChange: (newOffset: number) => void;
  config: YellowwoodConfig;
}

export interface UseMouseReturn {
  handleClick: (event: MouseEvent) => void;
  handleScroll: (event: ScrollEvent) => void;
}

/**
 * Mouse event handling hook for tree navigation.
 *
 * Provides handlers for:
 * - Left-click: Select/open files, toggle folders
 * - Right-click: Context menu
 * - Scroll: Navigate tree viewport
 *
 * @param options - Configuration and callbacks
 * @returns Event handlers for mouse interactions
 */
export function useMouse(options: UseMouseOptions): UseMouseReturn {
  const {
    fileTree,
    scrollOffset,
    viewportHeight,
    headerHeight = 1,
    onSelect,
    onToggle,
    onOpen,
    onContextMenu,
    onScrollChange,
    config,
  } = options;

  /**
   * Convert mouse y coordinate to tree row index.
   * Accounts for header offset and scroll position.
   */
  const getRowIndexFromY = useCallback(
    (y: number): number | null => {
      // Subtract header rows to get relative tree row
      const relativeY = y - headerHeight;

      // Check if click is in header or above tree
      if (relativeY < 0) {
        return null;
      }

      // Add scroll offset to get absolute tree index
      const rowIndex = relativeY + scrollOffset;

      // Bounds check
      if (rowIndex < 0 || rowIndex >= fileTree.length) {
        return null;
      }

      return rowIndex;
    },
    [headerHeight, scrollOffset, fileTree.length],
  );

  /**
   * Handle left and right mouse clicks.
   */
  const handleClick = useCallback(
    (event: MouseEvent) => {
      const rowIndex = getRowIndexFromY(event.y);

      // Click on empty space or header
      if (rowIndex === null) {
        return;
      }

      const node = fileTree[rowIndex];
      if (!node) {
        return;
      }

      // Right-click: context menu
      if (event.button === 'right') {
        onContextMenu(node.path, { x: event.x, y: event.y });
        return;
      }

      // Left-click behavior depends on node type and config
      if (event.button === 'left') {
        if (node.type === 'directory') {
          // Directories: always toggle expansion
          onToggle(node.path);
        } else {
          // Files: respect config.ui.leftClickAction
          const action = config.ui?.leftClickAction || 'open';

          if (action === 'open') {
            onOpen(node.path);
          } else {
            onSelect(node.path);
          }
        }
      }

      // Middle-click: ignore for now (future: could open in new pane)
    },
    [getRowIndexFromY, fileTree, onToggle, onOpen, onSelect, onContextMenu, config],
  );

  /**
   * Handle scroll wheel events.
   */
  const handleScroll = useCallback(
    (event: ScrollEvent) => {
      // deltaY is typically in increments of mouse wheel notches
      // Positive = scroll down (increase offset)
      // Negative = scroll up (decrease offset)

      const scrollLines = Math.sign(event.deltaY) * 3; // Scroll 3 lines per notch
      const newOffset = scrollOffset + scrollLines;

      // Calculate max scroll (total rows - viewport height)
      const maxScroll = Math.max(0, fileTree.length - viewportHeight);

      // Clamp to valid range
      const clampedOffset = Math.max(0, Math.min(newOffset, maxScroll));

      if (clampedOffset !== scrollOffset) {
        onScrollChange(clampedOffset);
      }
    },
    [scrollOffset, fileTree.length, viewportHeight, onScrollChange],
  );

  return {
    handleClick,
    handleScroll,
  };
}
