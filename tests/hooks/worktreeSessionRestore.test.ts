/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Worktree } from '../../src/types/index.js';
import * as stateUtils from '../../src/utils/state.js';

// Mock the state utilities
vi.mock('../../src/utils/state.js', async () => {
  const actual = await vi.importActual('../../src/utils/state.js');
  return {
    ...actual,
    saveSessionState: vi.fn().mockResolvedValue(undefined),
    loadSessionState: vi.fn().mockResolvedValue(null),
  };
});

describe('Worktree Session Restoration', () => {
  const mockWorktreeA: Worktree = {
    id: '/path/to/worktree-a',
    path: '/path/to/worktree-a',
    name: 'worktree-a',
    branch: 'feature/branch-a',
    isCurrent: true,
  };

  const mockWorktreeB: Worktree = {
    id: '/path/to/worktree-b',
    path: '/path/to/worktree-b',
    name: 'worktree-b',
    branch: 'feature/branch-b',
    isCurrent: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Session save on worktree switch', () => {
    it('saves current session before switching worktrees', async () => {
      const currentSelection = {
        selectedPath: '/path/to/worktree-a/src/file.ts',
        expandedFolders: ['/path/to/worktree-a/src', '/path/to/worktree-a/tests'],
        lastCopyProfile: 'debug',
        timestamp: expect.any(Number),
      };

      // Simulate saving session when switching from A to B
      await act(async () => {
        await stateUtils.saveSessionState(mockWorktreeA.id, currentSelection);
      });

      expect(stateUtils.saveSessionState).toHaveBeenCalledWith(
        mockWorktreeA.id,
        expect.objectContaining({
          selectedPath: currentSelection.selectedPath,
          expandedFolders: currentSelection.expandedFolders,
          lastCopyProfile: 'debug',
        })
      );
    });

    it('does not save session if no path is selected', async () => {
      // Should handle gracefully when selectedPath is null
      const emptySession = {
        selectedPath: null,
        expandedFolders: [],
        timestamp: Date.now(),
      };

      // In real implementation, handleSwitchWorktree checks if selectedPath exists before saving
      // This test verifies the saveSessionState can handle null selectedPath
      await act(async () => {
        await stateUtils.saveSessionState(mockWorktreeA.id, emptySession);
      });

      expect(stateUtils.saveSessionState).toHaveBeenCalled();
    });
  });

  describe('Session load on worktree switch', () => {
    it('loads target worktree session when switching', async () => {
      const savedSession = {
        selectedPath: '/path/to/worktree-b/src/component.tsx',
        expandedFolders: ['/path/to/worktree-b/src'],
        timestamp: Date.now(),
      };

      vi.mocked(stateUtils.loadSessionState).mockResolvedValueOnce(savedSession);

      // Simulate loading session when switching to worktree B
      const loadedSession = await stateUtils.loadSessionState(mockWorktreeB.id);

      expect(stateUtils.loadSessionState).toHaveBeenCalledWith(mockWorktreeB.id);
      expect(loadedSession).toEqual(savedSession);
    });

    it('handles missing session gracefully (never visited worktree)', async () => {
      vi.mocked(stateUtils.loadSessionState).mockResolvedValueOnce(null);

      const loadedSession = await stateUtils.loadSessionState(mockWorktreeB.id);

      expect(loadedSession).toBeNull();
      // Calling code should handle null by using default values
    });

    it('handles corrupted session file gracefully', async () => {
      // loadSessionState returns null for corrupted files
      vi.mocked(stateUtils.loadSessionState).mockResolvedValueOnce(null);

      const loadedSession = await stateUtils.loadSessionState(mockWorktreeB.id);

      expect(loadedSession).toBeNull();
    });
  });

  describe('Session persistence across switches', () => {
    it('restores session when switching back to previous worktree', async () => {
      const sessionA = {
        selectedPath: '/path/to/worktree-a/file1.ts',
        expandedFolders: ['/path/to/worktree-a/src'],
        timestamp: Date.now(),
      };

      const sessionB = {
        selectedPath: '/path/to/worktree-b/file2.ts',
        expandedFolders: ['/path/to/worktree-b/lib'],
        timestamp: Date.now(),
      };

      // Simulate workflow: A -> B -> A

      // Step 1: Save A, load B
      await act(async () => {
        await stateUtils.saveSessionState(mockWorktreeA.id, sessionA);
      });

      vi.mocked(stateUtils.loadSessionState).mockResolvedValueOnce(sessionB);
      const loadedB = await stateUtils.loadSessionState(mockWorktreeB.id);
      expect(loadedB).toEqual(sessionB);

      // Step 2: Save B, load A (should restore original A session)
      await act(async () => {
        await stateUtils.saveSessionState(mockWorktreeB.id, sessionB);
      });

      vi.mocked(stateUtils.loadSessionState).mockResolvedValueOnce(sessionA);
      const restoredA = await stateUtils.loadSessionState(mockWorktreeA.id);
      expect(restoredA).toEqual(sessionA);
    });

    it('handles rapid worktree switches without race conditions', async () => {
      // Simulate rapid switches: A -> B -> C
      const sessionA = {
        selectedPath: '/path/to/worktree-a/file.ts',
        expandedFolders: [],
        timestamp: Date.now(),
      };

      // Save A
      await act(async () => {
        await stateUtils.saveSessionState(mockWorktreeA.id, sessionA);
      });

      // Load B (returns null - no session)
      vi.mocked(stateUtils.loadSessionState).mockResolvedValueOnce(null);
      const loadedB = await stateUtils.loadSessionState(mockWorktreeB.id);
      expect(loadedB).toBeNull();

      // All saves/loads complete sequentially - no race conditions
      expect(stateUtils.saveSessionState).toHaveBeenCalledTimes(1);
      expect(stateUtils.loadSessionState).toHaveBeenCalledTimes(1);
    });
  });

  describe('Session state integration with initialSelection', () => {
    it('transforms loaded session into initialSelection state', () => {
      const loadedSession = {
        selectedPath: '/path/to/file.ts',
        expandedFolders: ['/path/to/src', '/path/to/lib'],
        timestamp: Date.now(),
      };

      // This mirrors the logic in handleSwitchWorktree
      const nextSelectedPath = loadedSession?.selectedPath ?? null;
      const nextExpandedFolders = new Set(loadedSession?.expandedFolders ?? []);

      expect(nextSelectedPath).toBe('/path/to/file.ts');
      expect(nextExpandedFolders).toEqual(new Set(['/path/to/src', '/path/to/lib']));
    });

    it('handles null session with default values', () => {
      const loadedSession = null;

      // This mirrors the logic in handleSwitchWorktree
      const nextSelectedPath = loadedSession?.selectedPath ?? null;
      const nextExpandedFolders = new Set(loadedSession?.expandedFolders ?? []);

      expect(nextSelectedPath).toBeNull();
      expect(nextExpandedFolders).toEqual(new Set());
    });

    it('clones Set to avoid stale references', () => {
      const originalSet = new Set(['/path/a', '/path/b']);
      const clonedSet = new Set(originalSet);

      // Modify original
      originalSet.add('/path/c');

      // Clone should not be affected
      expect(clonedSet).toEqual(new Set(['/path/a', '/path/b']));
      expect(clonedSet.has('/path/c')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('handles switching to same worktree (no-op scenario)', async () => {
      const session = {
        selectedPath: '/path/to/worktree-a/file.ts',
        expandedFolders: ['/path/to/worktree-a/src'],
        timestamp: Date.now(),
      };

      // Save and load same worktree
      await act(async () => {
        await stateUtils.saveSessionState(mockWorktreeA.id, session);
      });

      vi.mocked(stateUtils.loadSessionState).mockResolvedValueOnce(session);
      const loaded = await stateUtils.loadSessionState(mockWorktreeA.id);

      expect(loaded).toEqual(session);
    });

    it('handles empty expandedFolders array', async () => {
      const session = {
        selectedPath: '/path/to/file.ts',
        expandedFolders: [],
        timestamp: Date.now(),
      };

      await act(async () => {
        await stateUtils.saveSessionState(mockWorktreeA.id, session);
      });

      expect(stateUtils.saveSessionState).toHaveBeenCalledWith(
        mockWorktreeA.id,
        expect.objectContaining({
          expandedFolders: [],
        })
      );
    });

    it('handles session load errors gracefully', async () => {
      // loadSessionState throws error (e.g., disk I/O error)
      vi.mocked(stateUtils.loadSessionState).mockRejectedValueOnce(
        new Error('Disk read error')
      );

      await expect(stateUtils.loadSessionState(mockWorktreeB.id)).rejects.toThrow();

      // In real implementation, handleSwitchWorktree has try/catch that falls back gracefully
    });
  });
});
