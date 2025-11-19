/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFileTree } from '../../src/hooks/useFileTree.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import type { TreeNode, GitStatus } from '../../src/types/index.js';
import * as fileTreeUtils from '../../src/utils/fileTree.js';
import * as filterUtils from '../../src/utils/filter.js';

// Mock the utilities
vi.mock('../../src/utils/fileTree.js');
vi.mock('../../src/utils/filter.js');

describe('useFileTree', () => {
  const mockTree: TreeNode[] = [
    {
      name: 'src',
      path: '/test/src',
      type: 'directory',
      depth: 0,
      children: [
        {
          name: 'App.tsx',
          path: '/test/src/App.tsx',
          type: 'file',
          depth: 1,
        },
      ],
    },
    {
      name: 'README.md',
      path: '/test/README.md',
      type: 'file',
      depth: 0,
    },
  ];

  beforeEach(() => {
    // Mock buildFileTree to return test tree
    vi.mocked(fileTreeUtils.buildFileTree).mockResolvedValue(mockTree);

    // Mock filterTreeByName to return tree unchanged by default
    vi.mocked(filterUtils.filterTreeByName).mockImplementation(tree => tree);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads tree on mount', async () => {
    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.tree).toEqual([]);

    // Wait for tree to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tree).toEqual(mockTree);
    expect(fileTreeUtils.buildFileTree).toHaveBeenCalledWith('/test', DEFAULT_CONFIG);
  });

  it('reloads tree when rootPath changes', async () => {
    const { result, rerender } = renderHook(
      ({ rootPath }) => useFileTree({ rootPath, config: DEFAULT_CONFIG }),
      { initialProps: { rootPath: '/test1' } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Change rootPath
    rerender({ rootPath: '/test2' });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fileTreeUtils.buildFileTree).toHaveBeenCalledWith('/test2', DEFAULT_CONFIG);
  });

  it('reloads tree when config changes', async () => {
    const config1 = { ...DEFAULT_CONFIG, showHidden: false };
    const config2 = { ...DEFAULT_CONFIG, showHidden: true };

    const { result, rerender } = renderHook(
      ({ config }) => useFileTree({ rootPath: '/test', config }),
      { initialProps: { config: config1 } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Clear previous calls
    vi.clearAllMocks();

    // Change config
    rerender({ config: config2 });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fileTreeUtils.buildFileTree).toHaveBeenCalledWith('/test', config2);
  });

  it('expands folder correctly', async () => {
    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.expandFolder('/test/src');
    });

    expect(result.current.expandedFolders.has('/test/src')).toBe(true);
  });

  it('collapses folder correctly', async () => {
    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Expand first
    act(() => {
      result.current.expandFolder('/test/src');
    });

    expect(result.current.expandedFolders.has('/test/src')).toBe(true);

    // Then collapse
    act(() => {
      result.current.collapseFolder('/test/src');
    });

    expect(result.current.expandedFolders.has('/test/src')).toBe(false);
  });

  it('toggles folder correctly', async () => {
    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Toggle to expand
    act(() => {
      result.current.toggleFolder('/test/src');
    });

    expect(result.current.expandedFolders.has('/test/src')).toBe(true);

    // Toggle to collapse
    act(() => {
      result.current.toggleFolder('/test/src');
    });

    expect(result.current.expandedFolders.has('/test/src')).toBe(false);
  });

  it('selects path correctly', async () => {
    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.selectPath('/test/src/App.tsx');
    });

    expect(result.current.selectedPath).toBe('/test/src/App.tsx');
  });

  it('clears selection when passed null', async () => {
    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Select first
    act(() => {
      result.current.selectPath('/test/README.md');
    });

    expect(result.current.selectedPath).toBe('/test/README.md');

    // Clear selection
    act(() => {
      result.current.selectPath(null);
    });

    expect(result.current.selectedPath).toBe(null);
  });

  it('applies git status to tree nodes', async () => {
    const gitStatusMap = new Map<string, GitStatus>([
      ['/test/src/App.tsx', 'modified'],
      ['/test/README.md', 'added'],
    ]);

    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
        gitStatusMap,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Check that git status was attached
    const readmeNode = result.current.tree.find(n => n.name === 'README.md');
    expect(readmeNode?.gitStatus).toBe('added');

    const srcFolder = result.current.tree.find(n => n.name === 'src');
    const appNode = srcFolder?.children?.find(n => n.name === 'App.tsx');
    expect(appNode?.gitStatus).toBe('modified');
  });

  it('applies filter to tree', async () => {
    const filteredTree: TreeNode[] = [mockTree[1]]; // Just README.md

    vi.mocked(filterUtils.filterTreeByName).mockReturnValue(filteredTree);

    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
        filterQuery: 'README',
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(filterUtils.filterTreeByName).toHaveBeenCalledWith(mockTree, 'README');
    expect(result.current.tree).toEqual(filteredTree);
  });

  it('handles filter changes', async () => {
    const { result, rerender } = renderHook(
      ({ filterQuery }) =>
        useFileTree({
          rootPath: '/test',
          config: DEFAULT_CONFIG,
          filterQuery,
        }),
      { initialProps: { filterQuery: null as string | null } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // No filter initially
    expect(filterUtils.filterTreeByName).not.toHaveBeenCalled();

    // Add filter
    rerender({ filterQuery: '.tsx' });

    expect(filterUtils.filterTreeByName).toHaveBeenCalledWith(mockTree, '.tsx');
  });

  it('returns original tree when filter is cleared', async () => {
    const filteredTree: TreeNode[] = [mockTree[1]]; // Just README.md

    vi.mocked(filterUtils.filterTreeByName).mockReturnValue(filteredTree);

    const { result, rerender } = renderHook(
      ({ filterQuery }) =>
        useFileTree({
          rootPath: '/test',
          config: DEFAULT_CONFIG,
          filterQuery,
        }),
      { initialProps: { filterQuery: 'README' as string | null } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Tree should be filtered
    expect(result.current.tree).toEqual(filteredTree);

    // Clear filter with null
    vi.clearAllMocks();
    vi.mocked(filterUtils.filterTreeByName).mockImplementation(tree => tree);
    rerender({ filterQuery: null });

    // Should return original tree without calling filter
    expect(filterUtils.filterTreeByName).not.toHaveBeenCalled();
    expect(result.current.tree).toEqual(mockTree);

    // Clear filter with empty string
    rerender({ filterQuery: 'test' });
    vi.clearAllMocks();
    rerender({ filterQuery: '' });

    expect(filterUtils.filterTreeByName).not.toHaveBeenCalled();
    expect(result.current.tree).toEqual(mockTree);
  });

  it('refreshes tree manually', async () => {
    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Clear previous calls
    vi.clearAllMocks();

    // Trigger refresh
    await act(async () => {
      await result.current.refresh();
    });

    expect(fileTreeUtils.buildFileTree).toHaveBeenCalledWith('/test', DEFAULT_CONFIG);
    expect(result.current.loading).toBe(false);
  });

  it('sets loading to true during manual refresh', async () => {
    let resolveLoad: (value: TreeNode[]) => void;
    const loadPromise = new Promise<TreeNode[]>(resolve => {
      resolveLoad = resolve;
    });

    vi.mocked(fileTreeUtils.buildFileTree).mockReturnValue(loadPromise);

    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    // Wait for initial load
    resolveLoad!(mockTree);
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Setup new promise for refresh
    const refreshPromise = new Promise<TreeNode[]>(resolve => {
      resolveLoad = resolve;
    });
    vi.mocked(fileTreeUtils.buildFileTree).mockReturnValue(refreshPromise);

    // Start refresh
    let refreshComplete = false;
    act(() => {
      result.current.refresh().then(() => {
        refreshComplete = true;
      });
    });

    // Loading should be true immediately
    expect(result.current.loading).toBe(true);

    // Resolve refresh
    resolveLoad!(mockTree);
    await waitFor(() => expect(refreshComplete).toBe(true));

    expect(result.current.loading).toBe(false);
  });

  it('handles refresh errors gracefully', async () => {
    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Mock refresh to fail
    vi.mocked(fileTreeUtils.buildFileTree).mockRejectedValue(
      new Error('Refresh failed')
    );

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Trigger refresh
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.tree).toEqual([]); // Empty tree on error
    expect(result.current.loading).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to refresh tree:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it('handles tree loading errors gracefully', async () => {
    vi.mocked(fileTreeUtils.buildFileTree).mockRejectedValue(
      new Error('Permission denied')
    );

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tree).toEqual([]); // Empty tree on error
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to build file tree:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it('handles filter errors gracefully', async () => {
    vi.mocked(filterUtils.filterTreeByName).mockImplementation(() => {
      throw new Error('Invalid regex');
    });

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
        filterQuery: '[invalid',
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should return unfiltered tree on filter error
    expect(result.current.tree).toEqual(mockTree);
    expect(consoleSpy).toHaveBeenCalledWith('Filter error:', expect.any(Error));

    consoleSpy.mockRestore();
  });

  it('cancels in-flight loads on unmount', async () => {
    let resolveLoad: (value: TreeNode[]) => void;
    const loadPromise = new Promise<TreeNode[]>(resolve => {
      resolveLoad = resolve;
    });

    vi.mocked(fileTreeUtils.buildFileTree).mockReturnValue(loadPromise);

    const { unmount } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    // Unmount before load completes
    unmount();

    // Resolve the promise after unmount
    resolveLoad!(mockTree);

    // Wait a bit to ensure no state updates
    await new Promise(resolve => setTimeout(resolve, 50));

    // If this test doesn't throw a React warning, cancellation worked
  });

  it('preserves expansion state across refreshes', async () => {
    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Expand a folder
    act(() => {
      result.current.expandFolder('/test/src');
    });

    expect(result.current.expandedFolders.has('/test/src')).toBe(true);

    // Refresh
    await act(async () => {
      await result.current.refresh();
    });

    // Expansion state should be preserved
    expect(result.current.expandedFolders.has('/test/src')).toBe(true);
  });

  it('handles multiple folder expansions', async () => {
    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.expandFolder('/test/src');
      result.current.expandFolder('/test/utils');
      result.current.expandFolder('/test/components');
    });

    expect(result.current.expandedFolders.has('/test/src')).toBe(true);
    expect(result.current.expandedFolders.has('/test/utils')).toBe(true);
    expect(result.current.expandedFolders.has('/test/components')).toBe(true);
    expect(result.current.expandedFolders.size).toBe(3);
  });

  it('does not add duplicate paths when expanding already expanded folder', async () => {
    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.expandFolder('/test/src');
      result.current.expandFolder('/test/src'); // Expand again
    });

    expect(result.current.expandedFolders.has('/test/src')).toBe(true);
    expect(result.current.expandedFolders.size).toBe(1);
  });

  it('updates git status when gitStatusMap changes', async () => {
    const initialGitStatusMap = new Map<string, GitStatus>([
      ['/test/README.md', 'added'],
    ]);

    const { result, rerender } = renderHook(
      ({ gitStatusMap }) =>
        useFileTree({
          rootPath: '/test',
          config: DEFAULT_CONFIG,
          gitStatusMap,
        }),
      { initialProps: { gitStatusMap: initialGitStatusMap } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Initial status
    const readmeNode1 = result.current.tree.find(n => n.name === 'README.md');
    expect(readmeNode1?.gitStatus).toBe('added');

    // Update git status map
    const updatedGitStatusMap = new Map<string, GitStatus>([
      ['/test/README.md', 'modified'],
    ]);

    rerender({ gitStatusMap: updatedGitStatusMap });

    // Updated status
    const readmeNode2 = result.current.tree.find(n => n.name === 'README.md');
    expect(readmeNode2?.gitStatus).toBe('modified');
  });

  it('removes git status when gitStatusMap is empty', async () => {
    const gitStatusMap = new Map<string, GitStatus>([
      ['/test/README.md', 'added'],
    ]);

    const { result, rerender } = renderHook(
      ({ gitStatusMap }) =>
        useFileTree({
          rootPath: '/test',
          config: DEFAULT_CONFIG,
          gitStatusMap,
        }),
      { initialProps: { gitStatusMap } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Has git status initially
    const readmeNode1 = result.current.tree.find(n => n.name === 'README.md');
    expect(readmeNode1?.gitStatus).toBe('added');

    // Clear git status
    rerender({ gitStatusMap: new Map() });

    // No git status after clearing
    const readmeNode2 = result.current.tree.find(n => n.name === 'README.md');
    expect(readmeNode2?.gitStatus).toBeUndefined();
  });

  it('preserves filter and git status during refresh', async () => {
    const gitStatusMap = new Map<string, GitStatus>([
      ['/test/README.md', 'added'],
    ]);

    const filteredTree: TreeNode[] = [
      { ...mockTree[1], gitStatus: 'added' },
    ];

    vi.mocked(filterUtils.filterTreeByName).mockReturnValue(filteredTree);

    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
        filterQuery: 'README',
        gitStatusMap,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Tree should be filtered and have git status
    const readmeNode1 = result.current.tree.find(n => n.name === 'README.md');
    expect(readmeNode1?.gitStatus).toBe('added');
    expect(result.current.tree).toHaveLength(1);

    // Refresh
    await act(async () => {
      await result.current.refresh();
    });

    // Filter and git status should still be applied after refresh
    const readmeNode2 = result.current.tree.find(n => n.name === 'README.md');
    expect(readmeNode2?.gitStatus).toBe('added');
    expect(result.current.tree).toHaveLength(1);

    // Verify filter function was used (called at least during initial load)
    expect(filterUtils.filterTreeByName).toHaveBeenCalled();
  });

  it('handles empty filter results', async () => {
    const emptyFilteredTree: TreeNode[] = [];

    vi.mocked(filterUtils.filterTreeByName).mockReturnValue(emptyFilteredTree);

    const { result } = renderHook(() =>
      useFileTree({
        rootPath: '/test',
        config: DEFAULT_CONFIG,
        filterQuery: 'nonexistent',
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tree).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
