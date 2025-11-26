import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanupStaleNotes } from '../../src/utils/noteCleanup.js';
import * as fs from 'fs/promises';
import * as childProcess from 'child_process';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  rmdir: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('noteCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('cleanupStaleNotes', () => {
    it('skips cleanup if not a git repository', async () => {
      // execSync throws when not in a git repo
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('not a git repository');
      });

      await cleanupStaleNotes('/some/path');

      // Should not attempt to read directory or delete files
      expect(fs.readdir).not.toHaveBeenCalled();
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('always deletes main worktree note on startup (regardless of age)', async () => {
      vi.mocked(childProcess.execSync).mockReturnValue('/repo/.git\n');

      // No linked worktrees
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(fs.rmdir).mockResolvedValue(undefined);

      await cleanupStaleNotes('/repo');

      // Should delete the main note unconditionally
      expect(fs.unlink).toHaveBeenCalledWith('/repo/.git/canopy/note');
      // Should try to clean up empty canopy directory
      expect(fs.rmdir).toHaveBeenCalledWith('/repo/.git/canopy');
    });

    it('deletes main worktree note even if recent (main branch is persistent)', async () => {
      vi.mocked(childProcess.execSync).mockReturnValue('/repo/.git\n');

      // No linked worktrees
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(fs.rmdir).mockResolvedValue(undefined);

      await cleanupStaleNotes('/repo');

      // Main note should ALWAYS be deleted (main branch is persistent, not transient)
      expect(fs.unlink).toHaveBeenCalledWith('/repo/.git/canopy/note');
    });

    it('deletes stale notes from linked worktrees (24h rule)', async () => {
      vi.mocked(childProcess.execSync).mockReturnValue('/repo/.git\n');

      // Two linked worktrees
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-a', isDirectory: () => true },
        { name: 'feature-b', isDirectory: () => true },
      ] as any);

      // feature-a is old, feature-b is recent
      const oldMtime = Date.now() - 25 * 60 * 60 * 1000;
      const recentMtime = Date.now() - 1 * 60 * 60 * 1000;

      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ mtimeMs: oldMtime } as any) // feature-a (old)
        .mockResolvedValueOnce({ mtimeMs: recentMtime } as any); // feature-b (recent)

      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(fs.rmdir).mockResolvedValue(undefined);

      await cleanupStaleNotes('/repo');

      // Should delete main note (always) + feature-a's stale note
      expect(fs.unlink).toHaveBeenCalledTimes(2);
      expect(fs.unlink).toHaveBeenCalledWith('/repo/.git/canopy/note');
      expect(fs.unlink).toHaveBeenCalledWith('/repo/.git/worktrees/feature-a/canopy/note');
    });

    it('handles missing note files gracefully', async () => {
      vi.mocked(childProcess.execSync).mockReturnValue('/repo/.git\n');
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
      // Main note unlink fails because file doesn't exist
      vi.mocked(fs.unlink).mockRejectedValue(new Error('ENOENT'));

      // Should not throw
      await expect(cleanupStaleNotes('/repo')).resolves.not.toThrow();

      // Attempted to delete main note (always), but it didn't exist
      expect(fs.unlink).toHaveBeenCalledWith('/repo/.git/canopy/note');
    });

    it('handles unlink failures gracefully', async () => {
      vi.mocked(childProcess.execSync).mockReturnValue('/repo/.git\n');
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

      // Deletion fails (e.g., permission denied)
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Permission denied'));

      // Should not throw
      await expect(cleanupStaleNotes('/repo')).resolves.not.toThrow();
    });

    it('resolves relative git directory path', async () => {
      // git rev-parse returns relative path
      vi.mocked(childProcess.execSync).mockReturnValue('.git\n');
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(fs.rmdir).mockResolvedValue(undefined);

      await cleanupStaleNotes('/repo/subdir');

      // Should resolve to absolute path with namespaced canopy/note
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('/repo/subdir/.git/canopy/note'));
    });

    it('skips non-directory entries in worktrees folder', async () => {
      vi.mocked(childProcess.execSync).mockReturnValue('/repo/.git\n');

      // One directory and one file in worktrees
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-a', isDirectory: () => true },
        { name: 'some-file', isDirectory: () => false },
      ] as any);

      // feature-a is old
      const oldMtime = Date.now() - 25 * 60 * 60 * 1000;
      vi.mocked(fs.stat).mockResolvedValueOnce({ mtimeMs: oldMtime } as any); // feature-a

      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(fs.rmdir).mockResolvedValue(undefined);

      await cleanupStaleNotes('/repo');

      // Should delete main note (always) + feature-a (stale), not 'some-file'
      expect(fs.unlink).toHaveBeenCalledTimes(2);
      expect(fs.unlink).toHaveBeenCalledWith('/repo/.git/canopy/note');
      expect(fs.unlink).toHaveBeenCalledWith('/repo/.git/worktrees/feature-a/canopy/note');
    });
  });
});
