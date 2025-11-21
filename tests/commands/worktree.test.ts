import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { worktreeCommand } from '../../src/commands/definitions/worktree.js';
import type { CommandServices } from '../../src/commands/types.js';
import { events } from '../../src/services/events.js';

describe('worktreeCommand', () => {
  let mockServices: CommandServices;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on events.emit
    emitSpy = vi.spyOn(events, 'emit');

    // Create mock services
    mockServices = {
      ui: {
        notify: vi.fn(),
        refresh: vi.fn(),
        exit: vi.fn(),
      },
      system: {
        cwd: '/test/path',
        openExternal: vi.fn(),
        copyToClipboard: vi.fn(),
        exec: vi.fn(),
      },
      state: {
        selectedPath: null,
        fileTree: [],
        expandedPaths: new Set(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct command metadata', () => {
    expect(worktreeCommand.name).toBe('wt');
    expect(worktreeCommand.description).toBe('Switch between git worktrees');
    expect(worktreeCommand.aliases).toEqual(['worktree']);
    expect(worktreeCommand.usage).toBe('/wt [list|next|prev|<pattern>]');
  });

  describe('when invoked without arguments', () => {
    it('should notify user and emit ui:modal:open for worktree panel', async () => {
      const result = await worktreeCommand.execute([], mockServices);

      expect(mockServices.ui.notify).toHaveBeenCalledWith({
        type: 'info',
        message: 'Opening worktree panel…',
      });

      expect(emitSpy).toHaveBeenCalledWith('ui:modal:open', { id: 'worktree' });
      expect(result.success).toBe(true);
    });
  });

  describe('when invoked with "list"', () => {
    it('should notify user and emit ui:modal:open for worktree panel', async () => {
      const result = await worktreeCommand.execute(['list'], mockServices);

      expect(mockServices.ui.notify).toHaveBeenCalledWith({
        type: 'info',
        message: 'Opening worktree panel…',
      });

      expect(emitSpy).toHaveBeenCalledWith('ui:modal:open', { id: 'worktree' });
      expect(result.success).toBe(true);
    });
  });

  describe('when invoked with "next"', () => {
    it('should emit sys:worktree:cycle with direction=1', async () => {
      const result = await worktreeCommand.execute(['next'], mockServices);

      expect(emitSpy).toHaveBeenCalledWith('sys:worktree:cycle', { direction: 1 });
      expect(result.success).toBe(true);
    });
  });

  describe('when invoked with "prev"', () => {
    it('should emit sys:worktree:cycle with direction=-1', async () => {
      const result = await worktreeCommand.execute(['prev'], mockServices);

      expect(emitSpy).toHaveBeenCalledWith('sys:worktree:cycle', { direction: -1 });
      expect(result.success).toBe(true);
    });
  });

  describe('when invoked with a pattern', () => {
    it('should emit sys:worktree:selectByName with single-word query', async () => {
      const result = await worktreeCommand.execute(['main'], mockServices);

      expect(emitSpy).toHaveBeenCalledWith('sys:worktree:selectByName', { query: 'main' });
      expect(result.success).toBe(true);
    });

    it('should emit sys:worktree:selectByName with multi-word query', async () => {
      const result = await worktreeCommand.execute(['feature', 'branch'], mockServices);

      expect(emitSpy).toHaveBeenCalledWith('sys:worktree:selectByName', { query: 'feature branch' });
      expect(result.success).toBe(true);
    });

    it('should handle complex patterns with spaces', async () => {
      const result = await worktreeCommand.execute(['my', 'feature', 'branch'], mockServices);

      expect(emitSpy).toHaveBeenCalledWith('sys:worktree:selectByName', { query: 'my feature branch' });
      expect(result.success).toBe(true);
    });
  });
});
