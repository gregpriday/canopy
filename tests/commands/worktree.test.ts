import { describe, it, expect, vi, beforeEach } from 'vitest';
import { worktreeCommand } from '../../src/commands/worktree.js';
import type { CommandContext } from '../../src/commands/types.js';
import type { YellowwoodState, Worktree } from '../../src/types/index.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';

// Helper to create test worktrees
function createWorktree(
  id: string,
  name: string,
  path: string,
  branch?: string
): Worktree {
  return {
    id,
    name,
    path,
    branch,
    isCurrent: false,
  };
}

// Helper to create test context with mocks
function createTestContext(
  worktrees: Worktree[] = [],
  activeWorktreeId: string | null = null
): CommandContext {
  const state: YellowwoodState = {
    fileTree: [],
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
    worktrees,
    activeWorktreeId,
  };

  return {
    state,
    originalFileTree: [],
    setFilterActive: vi.fn(),
    setFilterQuery: vi.fn(),
    setFileTree: vi.fn(),
    notify: vi.fn(),
    addToHistory: vi.fn(),
    worktrees,
    activeWorktreeId,
    switchToWorktree: vi.fn().mockResolvedValue(undefined),
  };
}

describe('worktreeCommand', () => {
  const mockWorktrees: Worktree[] = [
    createWorktree('wt-main', 'main', '/repo', 'main'),
    createWorktree('wt-feature-login', 'feature/login', '/repo-feature-login', 'feature/login'),
    createWorktree('wt-feature-dashboard', 'feature/dashboard', '/repo-feature-dashboard', 'feature/dashboard'),
  ];

  describe('list subcommand', () => {
    it('lists all worktrees with current marker', async () => {
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      const result = await worktreeCommand.execute(['list'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.type).toBe('info');
      expect(result.notification?.message).toContain('3 total');
    });

    it('defaults to list when no args', async () => {
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      const result = await worktreeCommand.execute([], context);

      expect(result.success).toBe(true);
      expect(result.notification?.type).toBe('info');
      expect(result.notification?.message).toContain('3 total');
    });

    it('supports ls alias', async () => {
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      const result = await worktreeCommand.execute(['ls'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.type).toBe('info');
    });

    it('returns error when no worktrees found', async () => {
      const context = createTestContext([], null);
      const result = await worktreeCommand.execute(['list'], context);

      expect(result.success).toBe(false);
      expect(result.notification?.type).toBe('warning');
      expect(result.notification?.message).toContain('No worktrees');
    });

    it('calls notify callback', async () => {
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      await worktreeCommand.execute(['list'], context);

      expect(context.notify).toHaveBeenCalled();
    });
  });

  describe('next subcommand', () => {
    it('switches to next worktree', async () => {
      const switchMock = vi.fn().mockResolvedValue(undefined);
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      context.switchToWorktree = switchMock;

      const result = await worktreeCommand.execute(['next'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.type).toBe('success');
      expect(result.notification?.message).toContain('feature/login');
      expect(switchMock).toHaveBeenCalledWith(mockWorktrees[1]);
    });

    it('wraps from last to first', async () => {
      const switchMock = vi.fn().mockResolvedValue(undefined);
      const context = createTestContext(mockWorktrees, mockWorktrees[2].id);
      context.switchToWorktree = switchMock;

      await worktreeCommand.execute(['next'], context);

      expect(switchMock).toHaveBeenCalledWith(mockWorktrees[0]);
    });

    it('supports n alias', async () => {
      const switchMock = vi.fn().mockResolvedValue(undefined);
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      context.switchToWorktree = switchMock;

      const result = await worktreeCommand.execute(['n'], context);

      expect(result.success).toBe(true);
      expect(switchMock).toHaveBeenCalled();
    });

    it('returns info when only one worktree', async () => {
      const context = createTestContext([mockWorktrees[0]], mockWorktrees[0].id);
      const result = await worktreeCommand.execute(['next'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.type).toBe('info');
      expect(result.notification?.message).toContain('Only one');
    });

    it('returns error when no worktrees', async () => {
      const context = createTestContext([], null);
      const result = await worktreeCommand.execute(['next'], context);

      expect(result.success).toBe(false);
      expect(result.notification?.type).toBe('warning');
    });

    it('handles switching errors', async () => {
      const switchMock = vi.fn().mockRejectedValue(new Error('Switch failed'));
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      context.switchToWorktree = switchMock;

      const result = await worktreeCommand.execute(['next'], context);

      expect(result.success).toBe(false);
      expect(result.notification?.type).toBe('error');
      expect(result.notification?.message).toContain('Switch failed');
    });
  });

  describe('prev subcommand', () => {
    it('switches to previous worktree', async () => {
      const switchMock = vi.fn().mockResolvedValue(undefined);
      const context = createTestContext(mockWorktrees, mockWorktrees[1].id);
      context.switchToWorktree = switchMock;

      const result = await worktreeCommand.execute(['prev'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.type).toBe('success');
      expect(result.notification?.message).toContain('main');
      expect(switchMock).toHaveBeenCalledWith(mockWorktrees[0]);
    });

    it('wraps from first to last', async () => {
      const switchMock = vi.fn().mockResolvedValue(undefined);
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      context.switchToWorktree = switchMock;

      await worktreeCommand.execute(['prev'], context);

      expect(switchMock).toHaveBeenCalledWith(mockWorktrees[2]);
    });

    it('supports p and previous aliases', async () => {
      const switchMock = vi.fn().mockResolvedValue(undefined);

      const contextP = createTestContext(mockWorktrees, mockWorktrees[1].id);
      contextP.switchToWorktree = switchMock;
      await worktreeCommand.execute(['p'], contextP);
      expect(switchMock).toHaveBeenCalled();

      switchMock.mockClear();

      const contextPrevious = createTestContext(mockWorktrees, mockWorktrees[1].id);
      contextPrevious.switchToWorktree = switchMock;
      await worktreeCommand.execute(['previous'], contextPrevious);
      expect(switchMock).toHaveBeenCalled();
    });

    it('returns info when only one worktree', async () => {
      const context = createTestContext([mockWorktrees[0]], mockWorktrees[0].id);
      const result = await worktreeCommand.execute(['prev'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.type).toBe('info');
      expect(result.notification?.message).toContain('Only one');
    });
  });

  describe('switch by index', () => {
    it('switches by 1-based index', async () => {
      const switchMock = vi.fn().mockResolvedValue(undefined);
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      context.switchToWorktree = switchMock;

      const result = await worktreeCommand.execute(['2'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.message).toContain('feature/login');
      expect(switchMock).toHaveBeenCalledWith(mockWorktrees[1]);
    });

    it('rejects invalid index (too low)', async () => {
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      const result = await worktreeCommand.execute(['0'], context);

      expect(result.success).toBe(false);
      expect(result.notification?.type).toBe('error');
      expect(result.notification?.message).toContain('Invalid');
    });

    it('rejects invalid index (too high)', async () => {
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      const result = await worktreeCommand.execute(['10'], context);

      expect(result.success).toBe(false);
      expect(result.notification?.type).toBe('error');
      expect(result.notification?.message).toContain('Invalid');
    });

    it('shows valid range in error', async () => {
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      const result = await worktreeCommand.execute(['5'], context);

      expect(result.notification?.message).toContain('1-3');
    });
  });

  describe('switch by name', () => {
    it('switches by exact name', async () => {
      const switchMock = vi.fn().mockResolvedValue(undefined);
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      context.switchToWorktree = switchMock;

      const result = await worktreeCommand.execute(['feature/login'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.message).toContain('feature/login');
      expect(switchMock).toHaveBeenCalledWith(mockWorktrees[1]);
    });

    it('switches by partial name (fuzzy)', async () => {
      const switchMock = vi.fn().mockResolvedValue(undefined);
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      context.switchToWorktree = switchMock;

      const result = await worktreeCommand.execute(['login'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.message).toContain('feature/login');
      expect(switchMock).toHaveBeenCalledWith(mockWorktrees[1]);
    });

    it('switches by branch name (case-insensitive)', async () => {
      const switchMock = vi.fn().mockResolvedValue(undefined);
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      context.switchToWorktree = switchMock;

      const result = await worktreeCommand.execute(['DASHBOARD'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.message).toContain('feature/dashboard');
      expect(switchMock).toHaveBeenCalledWith(mockWorktrees[2]);
    });

    it('returns error when no match', async () => {
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      const result = await worktreeCommand.execute(['nonexistent'], context);

      expect(result.success).toBe(false);
      expect(result.notification?.type).toBe('error');
      expect(result.notification?.message).toContain('not found');
      expect(result.notification?.message).toContain('Available:');
    });

    it('returns error when ambiguous match', async () => {
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      const result = await worktreeCommand.execute(['feature'], context);

      expect(result.success).toBe(false);
      expect(result.notification?.type).toBe('error');
      expect(result.notification?.message).toContain('Ambiguous');
      expect(result.notification?.message).toContain('feature/login');
      expect(result.notification?.message).toContain('feature/dashboard');
    });

    it('lists available worktrees in error', async () => {
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      const result = await worktreeCommand.execute(['xyz'], context);

      expect(result.notification?.message).toContain('1. main');
      expect(result.notification?.message).toContain('2. feature/login');
      expect(result.notification?.message).toContain('3. feature/dashboard');
    });
  });

  describe('error cases', () => {
    it('returns error when no args for switch', async () => {
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      const result = await worktreeCommand.execute([], context);

      // Should default to list, not error
      expect(result.success).toBe(true);
    });

    it('returns error when no worktrees found', async () => {
      const context = createTestContext([], null);
      const result = await worktreeCommand.execute(['next'], context);

      expect(result.success).toBe(false);
      expect(result.notification?.type).toBe('warning');
    });

    it('handles missing switchToWorktree gracefully', async () => {
      const context = createTestContext(mockWorktrees, mockWorktrees[0].id);
      context.switchToWorktree = undefined;

      const result = await worktreeCommand.execute(['next'], context);

      expect(result.success).toBe(true);
      expect(result.notification?.message).toContain('not available');
    });
  });

  describe('command definition', () => {
    it('has correct name and aliases', () => {
      expect(worktreeCommand.name).toBe('wt');
      expect(worktreeCommand.aliases).toContain('worktree');
    });

    it('has description and examples', () => {
      expect(worktreeCommand.description).toBeTruthy();
      expect(worktreeCommand.examples?.length).toBeGreaterThan(0);
    });

    it('has usage information', () => {
      expect(worktreeCommand.usage).toBeTruthy();
    });
  });
});
