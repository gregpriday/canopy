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

    it('clamps scroll offset to valid range', () => {
      const flatNodes = createFlatNodes(100);
      // Try to scroll past the end
      const window = calculateVisibleWindow(flatNodes, 200, 20);

      expect(window.startIndex).toBe(80); // max valid offset = 100 - 20
      expect(window.endIndex).toBe(100);
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
});
