import { describe, it, expect } from 'vitest';
import {
  flattenVisibleTree,
  calculateVisibleWindow,
  calculateViewportHeight,
  findNodeIndex,
  calculateScrollToNode,
} from '../../src/utils/treeViewVirtualization.js';
import type { TreeNode } from '../../src/types/index.js';

describe('treeViewVirtualization', () => {
  describe('flattenVisibleTree', () => {
    it('flattens a simple flat tree', () => {
      const tree: TreeNode[] = [
        { name: 'file1.txt', path: '/file1.txt', type: 'file', depth: 0 },
        { name: 'file2.txt', path: '/file2.txt', type: 'file', depth: 0 },
        { name: 'file3.txt', path: '/file3.txt', type: 'file', depth: 0 },
      ];

      const flat = flattenVisibleTree(tree);

      expect(flat).toHaveLength(3);
      expect(flat[0].name).toBe('file1.txt');
      expect(flat[0].index).toBe(0);
      expect(flat[1].name).toBe('file2.txt');
      expect(flat[1].index).toBe(1);
      expect(flat[2].name).toBe('file3.txt');
      expect(flat[2].index).toBe(2);
    });

    it('includes children of expanded directories', () => {
      const tree: TreeNode[] = [
        {
          name: 'folder',
          path: '/folder',
          type: 'directory',
          depth: 0,
          expanded: true,
          children: [
            { name: 'file1.txt', path: '/folder/file1.txt', type: 'file', depth: 1 },
            { name: 'file2.txt', path: '/folder/file2.txt', type: 'file', depth: 1 },
          ],
        },
      ];

      const flat = flattenVisibleTree(tree);

      expect(flat).toHaveLength(3);
      expect(flat[0].name).toBe('folder');
      expect(flat[0].depth).toBe(0);
      expect(flat[1].name).toBe('file1.txt');
      expect(flat[1].depth).toBe(1);
      expect(flat[2].name).toBe('file2.txt');
      expect(flat[2].depth).toBe(1);
    });

    it('excludes children of collapsed directories', () => {
      const tree: TreeNode[] = [
        {
          name: 'folder',
          path: '/folder',
          type: 'directory',
          depth: 0,
          expanded: false,
          children: [
            { name: 'file1.txt', path: '/folder/file1.txt', type: 'file', depth: 1 },
            { name: 'file2.txt', path: '/folder/file2.txt', type: 'file', depth: 1 },
          ],
        },
      ];

      const flat = flattenVisibleTree(tree);

      expect(flat).toHaveLength(1);
      expect(flat[0].name).toBe('folder');
    });

    it('handles nested directories with mixed expansion states', () => {
      const tree: TreeNode[] = [
        {
          name: 'folder1',
          path: '/folder1',
          type: 'directory',
          depth: 0,
          expanded: true,
          children: [
            { name: 'file1.txt', path: '/folder1/file1.txt', type: 'file', depth: 1 },
            {
              name: 'folder2',
              path: '/folder1/folder2',
              type: 'directory',
              depth: 1,
              expanded: false,
              children: [
                { name: 'hidden.txt', path: '/folder1/folder2/hidden.txt', type: 'file', depth: 2 },
              ],
            },
            { name: 'file2.txt', path: '/folder1/file2.txt', type: 'file', depth: 1 },
          ],
        },
      ];

      const flat = flattenVisibleTree(tree);

      expect(flat).toHaveLength(4);
      expect(flat[0].name).toBe('folder1');
      expect(flat[1].name).toBe('file1.txt');
      expect(flat[2].name).toBe('folder2');
      expect(flat[3].name).toBe('file2.txt');
      // hidden.txt should not be included
      expect(flat.find((n) => n.name === 'hidden.txt')).toBeUndefined();
    });

    it('assigns correct indices to flattened nodes', () => {
      const tree: TreeNode[] = [
        { name: 'a.txt', path: '/a.txt', type: 'file', depth: 0 },
        { name: 'b.txt', path: '/b.txt', type: 'file', depth: 0 },
        { name: 'c.txt', path: '/c.txt', type: 'file', depth: 0 },
      ];

      const flat = flattenVisibleTree(tree);

      flat.forEach((node, idx) => {
        expect(node.index).toBe(idx);
      });
    });

    it('handles empty tree', () => {
      const tree: TreeNode[] = [];
      const flat = flattenVisibleTree(tree);
      expect(flat).toHaveLength(0);
    });

    it('preserves depth information', () => {
      const tree: TreeNode[] = [
        {
          name: 'level0',
          path: '/level0',
          type: 'directory',
          depth: 0,
          expanded: true,
          children: [
            {
              name: 'level1',
              path: '/level0/level1',
              type: 'directory',
              depth: 1,
              expanded: true,
              children: [
                { name: 'level2.txt', path: '/level0/level1/level2.txt', type: 'file', depth: 2 },
              ],
            },
          ],
        },
      ];

      const flat = flattenVisibleTree(tree);

      expect(flat[0].depth).toBe(0);
      expect(flat[1].depth).toBe(1);
      expect(flat[2].depth).toBe(2);
    });
  });

  describe('calculateVisibleWindow', () => {
    const createFlatNodes = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        name: `file${i}.txt`,
        path: `/file${i}.txt`,
        type: 'file' as const,
        depth: 0,
        index: i,
      }));

    it('returns all nodes when tree fits in viewport', () => {
      const flatNodes = createFlatNodes(10);
      const window = calculateVisibleWindow(flatNodes, 0, 20);

      expect(window.nodes).toHaveLength(10);
      expect(window.startIndex).toBe(0);
      expect(window.endIndex).toBe(10);
      expect(window.totalNodes).toBe(10);
      expect(window.scrolledPast).toBe(0);
      expect(window.remaining).toBe(0);
    });

    it('returns only visible nodes when tree exceeds viewport', () => {
      const flatNodes = createFlatNodes(100);
      const window = calculateVisibleWindow(flatNodes, 0, 20);

      expect(window.nodes).toHaveLength(20);
      expect(window.startIndex).toBe(0);
      expect(window.endIndex).toBe(20);
      expect(window.totalNodes).toBe(100);
      expect(window.scrolledPast).toBe(0);
      expect(window.remaining).toBe(80);
    });

    it('calculates correct window when scrolled', () => {
      const flatNodes = createFlatNodes(100);
      const window = calculateVisibleWindow(flatNodes, 30, 20);

      expect(window.nodes).toHaveLength(20);
      expect(window.startIndex).toBe(30);
      expect(window.endIndex).toBe(50);
      expect(window.scrolledPast).toBe(30);
      expect(window.remaining).toBe(50);
    });

    it('allows elastic bottom (overscroll) for tree mutations', () => {
      const flatNodes = createFlatNodes(100);
      // Try to scroll past the end (simulating a tree collapse while scrolled)
      const window = calculateVisibleWindow(flatNodes, 200, 20);

      // Should allow overscroll (elastic bottom) - no bottom clamping
      expect(window.startIndex).toBe(200);
      expect(window.endIndex).toBe(100); // endIndex clamped to totalNodes
      expect(window.nodes).toHaveLength(0); // No nodes visible (all whitespace)
      expect(window.scrolledPast).toBe(200);
      expect(window.remaining).toBe(0);
    });

    it('handles negative scroll offset', () => {
      const flatNodes = createFlatNodes(100);
      const window = calculateVisibleWindow(flatNodes, -10, 20);

      expect(window.startIndex).toBe(0);
      expect(window.endIndex).toBe(20);
    });

    it('handles scroll to end of tree', () => {
      const flatNodes = createFlatNodes(100);
      const window = calculateVisibleWindow(flatNodes, 80, 20);

      expect(window.nodes).toHaveLength(20);
      expect(window.startIndex).toBe(80);
      expect(window.endIndex).toBe(100);
      expect(window.remaining).toBe(0);
    });

    it('handles empty tree', () => {
      const flatNodes = createFlatNodes(0);
      const window = calculateVisibleWindow(flatNodes, 0, 20);

      expect(window.nodes).toHaveLength(0);
      expect(window.totalNodes).toBe(0);
      expect(window.scrolledPast).toBe(0);
      expect(window.remaining).toBe(0);
    });

    it('returns correct nodes at specific offset', () => {
      const flatNodes = createFlatNodes(50);
      const window = calculateVisibleWindow(flatNodes, 10, 5);

      expect(window.nodes[0].name).toBe('file10.txt');
      expect(window.nodes[4].name).toBe('file14.txt');
    });
  });

  describe('calculateViewportHeight', () => {
    it('subtracts reserved rows from terminal height', () => {
      // Mock process.stdout.rows
      const originalRows = process.stdout.rows;
      Object.defineProperty(process.stdout, 'rows', { value: 30, writable: true, configurable: true });

      const height = calculateViewportHeight(3);
      expect(height).toBe(27); // 30 - 3

      // Restore
      Object.defineProperty(process.stdout, 'rows', { value: originalRows, writable: true, configurable: true });
    });

    it('ensures minimum height of 1', () => {
      const originalRows = process.stdout.rows;
      Object.defineProperty(process.stdout, 'rows', { value: 2, writable: true, configurable: true });

      const height = calculateViewportHeight(3);
      expect(height).toBe(1); // min is 1

      Object.defineProperty(process.stdout, 'rows', { value: originalRows, writable: true, configurable: true });
    });
  });

  describe('findNodeIndex', () => {
    it('finds node by path', () => {
      const flatNodes = [
        { name: 'a.txt', path: '/a.txt', type: 'file' as const, depth: 0, index: 0 },
        { name: 'b.txt', path: '/b.txt', type: 'file' as const, depth: 0, index: 1 },
        { name: 'c.txt', path: '/c.txt', type: 'file' as const, depth: 0, index: 2 },
      ];

      expect(findNodeIndex(flatNodes, '/b.txt')).toBe(1);
    });

    it('returns -1 for non-existent path', () => {
      const flatNodes = [
        { name: 'a.txt', path: '/a.txt', type: 'file' as const, depth: 0, index: 0 },
      ];

      expect(findNodeIndex(flatNodes, '/missing.txt')).toBe(-1);
    });

    it('returns -1 for empty tree', () => {
      expect(findNodeIndex([], '/any.txt')).toBe(-1);
    });
  });

  describe('calculateScrollToNode', () => {
    it('does not scroll when node is visible', () => {
      const offset = calculateScrollToNode(10, 5, 20);
      expect(offset).toBe(5); // node 10 is between 5 and 25
    });

    it('scrolls up when node is above viewport', () => {
      const offset = calculateScrollToNode(3, 10, 20);
      expect(offset).toBe(3); // scroll to show node 3 at top
    });

    it('scrolls down when node is below viewport', () => {
      const offset = calculateScrollToNode(30, 5, 20);
      expect(offset).toBe(11); // scroll to show node 30 at bottom (30 - 20 + 1)
    });

    it('handles node at exact top of viewport', () => {
      const offset = calculateScrollToNode(10, 10, 20);
      expect(offset).toBe(10); // already visible
    });

    it('handles node at exact bottom of viewport', () => {
      const offset = calculateScrollToNode(29, 10, 20);
      expect(offset).toBe(10); // node 29 is at index 29, viewport is 10-29
    });
  });

  describe('scroll anchoring behavior', () => {
    it('maintains top-anchor when tree expands below viewport', () => {
      // Simulate scrolling to middle of tree
      const initialTree: TreeNode[] = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.txt`,
        path: `/file${i}.txt`,
        type: 'file' as const,
        depth: 0,
      }));
      const initialFlat = flattenVisibleTree(initialTree);
      const scrollOffset = 20; // Showing files 20-39
      const viewportHeight = 20;

      // Get the anchor node at top of viewport
      const anchorNode = initialFlat[scrollOffset];
      expect(anchorNode.path).toBe('/file20.txt');

      // Simulate expanding a folder above the viewport (adds 10 children)
      const expandedTree: TreeNode[] = [
        {
          name: 'folder',
          path: '/folder',
          type: 'directory' as const,
          depth: 0,
          expanded: true,
          children: Array.from({ length: 10 }, (_, i) => ({
            name: `child${i}.txt`,
            path: `/folder/child${i}.txt`,
            type: 'file' as const,
            depth: 1,
          })),
        },
        ...initialTree,
      ];
      const expandedFlat = flattenVisibleTree(expandedTree);

      // Find where the anchor node moved to
      const newAnchorIndex = findNodeIndex(expandedFlat, anchorNode.path);
      expect(newAnchorIndex).toBe(31); // 1 (folder) + 10 (children) + 20 (original offset)

      // The new scroll offset should be the new anchor index to keep it at top
      const newScrollOffset = Math.max(0, newAnchorIndex);
      expect(newScrollOffset).toBe(31);

      // Verify the anchor is still at top of viewport
      const window = calculateVisibleWindow(expandedFlat, newScrollOffset, viewportHeight);
      expect(window.nodes[0].path).toBe('/file20.txt');
    });

    it('maintains top-anchor when tree collapses above viewport', () => {
      // Start with expanded tree
      const expandedTree: TreeNode[] = [
        {
          name: 'folder',
          path: '/folder',
          type: 'directory' as const,
          depth: 0,
          expanded: true,
          children: Array.from({ length: 10 }, (_, i) => ({
            name: `child${i}.txt`,
            path: `/folder/child${i}.txt`,
            type: 'file' as const,
            depth: 1,
          })),
        },
        ...Array.from({ length: 50 }, (_, i) => ({
          name: `file${i}.txt`,
          path: `/file${i}.txt`,
          type: 'file' as const,
          depth: 0,
        })),
      ];
      const expandedFlat = flattenVisibleTree(expandedTree);
      const scrollOffset = 31; // Showing file20.txt at top (after folder + 10 children + 20 files)
      const viewportHeight = 20;

      const anchorNode = expandedFlat[scrollOffset];
      expect(anchorNode.path).toBe('/file20.txt');

      // Collapse the folder (removes 10 children)
      const collapsedTree: TreeNode[] = [
        {
          name: 'folder',
          path: '/folder',
          type: 'directory' as const,
          depth: 0,
          expanded: false,
        },
        ...Array.from({ length: 50 }, (_, i) => ({
          name: `file${i}.txt`,
          path: `/file${i}.txt`,
          type: 'file' as const,
          depth: 0,
        })),
      ];
      const collapsedFlat = flattenVisibleTree(collapsedTree);

      // Find where the anchor node moved to
      const newAnchorIndex = findNodeIndex(collapsedFlat, anchorNode.path);
      expect(newAnchorIndex).toBe(21); // 1 (folder) + 20 (original offset, without children)

      // The new scroll offset should keep the anchor at top
      const newScrollOffset = Math.max(0, newAnchorIndex);
      expect(newScrollOffset).toBe(21);

      // Verify the anchor is still at top of viewport
      const window = calculateVisibleWindow(collapsedFlat, newScrollOffset, viewportHeight);
      expect(window.nodes[0].path).toBe('/file20.txt');
    });

    it('handles anchor disappearance by using node at same index', () => {
      // Tree with a folder that will be deleted
      const initialTree: TreeNode[] = [
        ...Array.from({ length: 20 }, (_, i) => ({
          name: `file${i}.txt`,
          path: `/file${i}.txt`,
          type: 'file' as const,
          depth: 0,
        })),
        {
          name: 'folder-to-delete',
          path: '/folder-to-delete',
          type: 'directory' as const,
          depth: 0,
          expanded: false,
        },
        ...Array.from({ length: 30 }, (_, i) => ({
          name: `file${i + 20}.txt`,
          path: `/file${i + 20}.txt`,
          type: 'file' as const,
          depth: 0,
        })),
      ];
      const initialFlat = flattenVisibleTree(initialTree);
      const scrollOffset = 20; // Anchor is the folder-to-delete
      const viewportHeight = 20;

      const anchorNode = initialFlat[scrollOffset];
      expect(anchorNode.path).toBe('/folder-to-delete');

      // Delete the folder
      const deletedTree: TreeNode[] = [
        ...Array.from({ length: 20 }, (_, i) => ({
          name: `file${i}.txt`,
          path: `/file${i}.txt`,
          type: 'file' as const,
          depth: 0,
        })),
        ...Array.from({ length: 30 }, (_, i) => ({
          name: `file${i + 20}.txt`,
          path: `/file${i + 20}.txt`,
          type: 'file' as const,
          depth: 0,
        })),
      ];
      const deletedFlat = flattenVisibleTree(deletedTree);

      // Anchor disappeared, fallback should use node at prevTopIndex (20)
      const fallbackNode = deletedFlat[scrollOffset];
      expect(fallbackNode).toBeDefined();
      expect(fallbackNode.path).toBe('/file20.txt'); // The file that now occupies index 20

      // Viewport should show the fallback node at top, staying near the mutation
      const window = calculateVisibleWindow(deletedFlat, scrollOffset, viewportHeight);
      expect(window.nodes[0].path).toBe('/file20.txt');
    });

    it('handles anchor disappearance when tree becomes shorter than scroll offset', () => {
      // Large tree scrolled to bottom
      const initialTree: TreeNode[] = Array.from({ length: 100 }, (_, i) => ({
        name: `file${i}.txt`,
        path: `/file${i}.txt`,
        type: 'file' as const,
        depth: 0,
      }));
      const initialFlat = flattenVisibleTree(initialTree);
      const scrollOffset = 80;
      const viewportHeight = 20;

      // Simulate deleting many files, leaving only 30
      const reducedTree: TreeNode[] = Array.from({ length: 30 }, (_, i) => ({
        name: `file${i}.txt`,
        path: `/file${i}.txt`,
        type: 'file' as const,
        depth: 0,
      }));
      const reducedFlat = flattenVisibleTree(reducedTree);

      // Tree is now shorter than scrollOffset (30 < 80)
      // Fallback should clamp to valid range
      const fallbackNode = reducedFlat[scrollOffset];
      expect(fallbackNode).toBeUndefined(); // Index 80 doesn't exist anymore

      // Should clamp to maxScroll = max(0, 30 - 20) = 10
      const maxScroll = Math.max(0, reducedFlat.length - viewportHeight);
      expect(maxScroll).toBe(10);

      // Viewport should be clamped to valid range
      const window = calculateVisibleWindow(reducedFlat, maxScroll, viewportHeight);
      expect(window.startIndex).toBe(10);
      expect(window.endIndex).toBe(30);
      expect(window.nodes).toHaveLength(20);
    });

    it('allows elastic bottom after tree collapse (overscroll)', () => {
      // Tree with 100 items, scrolled near bottom
      const initialTree: TreeNode[] = Array.from({ length: 100 }, (_, i) => ({
        name: `file${i}.txt`,
        path: `/file${i}.txt`,
        type: 'file' as const,
        depth: 0,
      }));
      const initialFlat = flattenVisibleTree(initialTree);
      const scrollOffset = 80;
      const viewportHeight = 20;

      // Collapse reduces tree to 50 items (anchor at index 80 disappears)
      const collapsedTree: TreeNode[] = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.txt`,
        path: `/file${i}.txt`,
        type: 'file' as const,
        depth: 0,
      }));
      const collapsedFlat = flattenVisibleTree(collapsedTree);

      // Even though maxScroll would be 30, elastic bottom allows scrollOffset > maxScroll
      // This creates temporary whitespace until user scrolls up
      const elasticOffset = scrollOffset; // Keep at 80 even though tree is only 50 items
      const window = calculateVisibleWindow(collapsedFlat, elasticOffset, viewportHeight);

      // Should show empty viewport (all whitespace)
      expect(window.startIndex).toBe(80);
      expect(window.endIndex).toBe(50); // Clamped to totalNodes
      expect(window.nodes).toHaveLength(0); // No visible nodes
      expect(window.scrolledPast).toBe(80);
      expect(window.remaining).toBe(0);
    });
  });
});
