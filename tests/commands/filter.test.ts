import { describe, it, expect, vi } from 'vitest';
import { filterCommand } from '../../src/commands/filter.js';
import type { CommandContext } from '../../src/commands/types.js';
import type { TreeNode, YellowwoodState } from '../../src/types/index.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';

// Helper to create test nodes
function createFile(name: string, path: string): TreeNode {
  return {
    name,
    path,
    type: 'file',
    depth: 0,
  };
}

function createFolder(name: string, path: string, children: TreeNode[]): TreeNode {
  return {
    name,
    path,
    type: 'directory',
    depth: 0,
    children,
  };
}

// Helper to create test context with mocks
function createTestContext(tree: TreeNode[] = []): CommandContext {
  const state: YellowwoodState = {
    fileTree: tree,
    expandedFolders: new Set(),
    selectedPath: '',
    cursorPosition: 0,
    showPreview: false,
    showHelp: false,
    contextMenuOpen: false,
    contextMenuPosition: { x: 0, y: 0 },
    filterActive: false,
    filterQuery: '',
    filteredPaths: [],
    gitStatus: new Map(),
    gitEnabled: true,
    notification: null,
    commandBarActive: false,
    commandBarInput: '',
    commandHistory: [],
    config: DEFAULT_CONFIG,
    worktrees: [],
    activeWorktreeId: null,
  };

  return {
    state,
    originalFileTree: tree,
    setFilterActive: vi.fn(),
    setFilterQuery: vi.fn(),
    setFileTree: vi.fn(),
    notify: vi.fn(),
    addToHistory: vi.fn(),
    worktrees: [],
    activeWorktreeId: null,
  };
}

describe('filterCommand', () => {
  it('has correct name and aliases', () => {
    expect(filterCommand.name).toBe('filter');
    expect(filterCommand.aliases).toContain('f');
  });

  it('has description and usage', () => {
    expect(filterCommand.description).toBeTruthy();
    expect(filterCommand.usage).toBeTruthy();
  });

  describe('execute', () => {
    it('filters tree by pattern', async () => {
      const tree = [
        createFile('app.ts', '/app.ts'),
        createFile('test.ts', '/test.ts'),
        createFile('component.tsx', '/component.tsx'),
      ];
      const context = createTestContext(tree);

      const result = await filterCommand.execute(['app'], context);

      expect(result.success).toBe(true);
      expect(context.setFilterActive).toHaveBeenCalledWith(true);
      expect(context.setFilterQuery).toHaveBeenCalledWith('app');
      expect(context.setFileTree).toHaveBeenCalled();
      expect(result.notification?.type).toBe('success');
      expect(result.notification?.message).toContain('1 file');
    });

    it('handles patterns with spaces', async () => {
      const tree = [
        createFile('my component.tsx', '/my component.tsx'),
        createFile('other.tsx', '/other.tsx'),
      ];
      const context = createTestContext(tree);

      const result = await filterCommand.execute(['my', 'component'], context);

      expect(result.success).toBe(true);
      expect(context.setFilterQuery).toHaveBeenCalledWith('my component');
      expect(result.notification?.type).toBe('success');
    });

    it('shows file count in success notification', async () => {
      const tree = [
        createFile('app.ts', '/app.ts'),
        createFile('app.test.ts', '/app.test.ts'),
        createFile('other.ts', '/other.ts'),
      ];
      const context = createTestContext(tree);

      const result = await filterCommand.execute(['app'], context);

      expect(result.notification?.message).toContain('2 files');
    });

    it('uses singular "file" for count of 1', async () => {
      const tree = [
        createFile('app.ts', '/app.ts'),
        createFile('other.ts', '/other.ts'),
      ];
      const context = createTestContext(tree);

      const result = await filterCommand.execute(['app'], context);

      expect(result.notification?.message).toContain('1 file');
      expect(result.notification?.message).not.toContain('files');
    });

    it('shows warning when no matches found', async () => {
      const tree = [
        createFile('app.ts', '/app.ts'),
        createFile('test.ts', '/test.ts'),
      ];
      const context = createTestContext(tree);

      const result = await filterCommand.execute(['nonexistent'], context);

      expect(result.success).toBe(true);
      expect(context.setFilterActive).toHaveBeenCalledWith(true);
      expect(context.setFilterQuery).toHaveBeenCalledWith('nonexistent');
      expect(result.notification?.type).toBe('warning');
      expect(result.notification?.message).toContain('No files match');
      expect(result.notification?.message).toContain('nonexistent');

      // Verify state updates are actually called
      expect(context.setFileTree).toHaveBeenCalled();
      const setFileTreeCall = (context.setFileTree as any).mock.calls[0];
      expect(setFileTreeCall[0]).toEqual([]); // Empty tree

      // Verify notify was called with warning
      expect(context.notify).toHaveBeenCalled();
      const notifyCall = (context.notify as any).mock.calls[0];
      expect(notifyCall[0].type).toBe('warning');
    });

    it('clears filter with "clear" argument', async () => {
      const tree = [createFile('app.ts', '/app.ts')];
      const context = createTestContext(tree);

      const result = await filterCommand.execute(['clear'], context);

      expect(result.success).toBe(true);
      expect(context.setFilterActive).toHaveBeenCalledWith(false);
      expect(context.setFilterQuery).toHaveBeenCalledWith('');
      expect(result.notification?.type).toBe('info');
      expect(result.notification?.message).toBe('Filter cleared');
    });

    it('clears filter with no arguments', async () => {
      const tree = [createFile('app.ts', '/app.ts')];
      const context = createTestContext(tree);

      const result = await filterCommand.execute([], context);

      expect(result.success).toBe(true);
      expect(context.setFilterActive).toHaveBeenCalledWith(false);
      expect(context.setFilterQuery).toHaveBeenCalledWith('');
      expect(result.notification?.message).toBe('Filter cleared');
    });

    it('preserves folder hierarchy in results', async () => {
      const tree = [
        createFolder('src', '/src', [
          createFile('app.ts', '/src/app.ts'),
          createFile('test.ts', '/src/test.ts'),
        ]),
      ];
      const context = createTestContext(tree);

      const result = await filterCommand.execute(['app'], context);

      expect(result.success).toBe(true);
      expect(context.setFileTree).toHaveBeenCalled();

      // Get the filtered tree passed to setFileTree
      const setFileTreeCall = (context.setFileTree as any).mock.calls[0];
      const filteredTree = setFileTreeCall[0];

      expect(filteredTree).toHaveLength(1);
      expect(filteredTree[0].type).toBe('directory');
      expect(filteredTree[0].name).toBe('src');
      expect(filteredTree[0].children).toHaveLength(1);
      expect(filteredTree[0].children[0].name).toBe('app.ts');
    });

    it('handles empty tree gracefully', async () => {
      const context = createTestContext([]);

      const result = await filterCommand.execute(['anything'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.type).toBe('warning');
      expect(result.notification?.message).toContain('No files match');
    });

    it('is case-insensitive', async () => {
      const tree = [
        createFile('README.md', '/README.md'),
        createFile('test.ts', '/test.ts'),
      ];
      const context = createTestContext(tree);

      const result = await filterCommand.execute(['readme'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.type).toBe('success');
      expect(result.notification?.message).toContain('1 file');
    });

    it('counts only files, not folders', async () => {
      const tree = [
        createFolder('components', '/components', [
          createFile('Button.tsx', '/components/Button.tsx'),
          createFile('Input.tsx', '/components/Input.tsx'),
        ]),
      ];
      const context = createTestContext(tree);

      const result = await filterCommand.execute(['comp'], context);

      // Should count 2 files (Button.tsx + Input.tsx), not 3 (folder + files)
      // When folder name matches, it includes all children
      expect(result.notification?.message).toContain('2 files');
    });

    it('calls notify with notification', async () => {
      const tree = [createFile('app.ts', '/app.ts')];
      const context = createTestContext(tree);

      await filterCommand.execute(['app'], context);

      expect(context.notify).toHaveBeenCalled();
      const notification = (context.notify as any).mock.calls[0][0];
      expect(notification.type).toBe('success');
      expect(notification.message).toContain('1 file');
    });

    it('handles multiple filter operations', async () => {
      const tree = [
        createFile('app.ts', '/app.ts'),
        createFile('test.ts', '/test.ts'),
        createFile('component.tsx', '/component.tsx'),
      ];
      const context = createTestContext(tree);

      // First filter
      await filterCommand.execute(['app'], context);
      expect(context.setFilterActive).toHaveBeenCalledWith(true);

      // Second filter (different pattern)
      await filterCommand.execute(['test'], context);
      expect(context.setFilterQuery).toHaveBeenCalledWith('test');

      // Clear filter
      await filterCommand.execute(['clear'], context);
      expect(context.setFilterActive).toHaveBeenCalledWith(false);
    });
  });
});
