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

    it('deletes main worktree note if older than 24 hours', async () => {
      vi.mocked(childProcess.execSync).mockReturnValue('/repo/.git\n');

      // No linked worktrees
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

      // Main note is 25 hours old
      const oldMtime = Date.now() - 25 * 60 * 60 * 1000;
      vi.mocked(fs.stat).mockResolvedValue({ mtimeMs: oldMtime } as any);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(fs.rmdir).mockResolvedValue(undefined);

      await cleanupStaleNotes('/repo');

      // Should delete the main note (now at .git/canopy/note)
      expect(fs.unlink).toHaveBeenCalledWith('/repo/.git/canopy/note');
      // Should try to clean up empty canopy directory
      expect(fs.rmdir).toHaveBeenCalledWith('/repo/.git/canopy');
    });

    it('does not delete main worktree note if less than 24 hours old', async () => {
      vi.mocked(childProcess.execSync).mockReturnValue('/repo/.git\n');

      // No linked worktrees
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

      // Main note is 1 hour old
      const recentMtime = Date.now() - 1 * 60 * 60 * 1000;
      vi.mocked(fs.stat).mockResolvedValue({ mtimeMs: recentMtime } as any);

      await cleanupStaleNotes('/repo');

      // Should NOT delete the note
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('deletes stale notes from linked worktrees', async () => {
      vi.mocked(childProcess.execSync).mockReturnValue('/repo/.git\n');

      // Two linked worktrees
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-a', isDirectory: () => true },
        { name: 'feature-b', isDirectory: () => true },
      ] as any);

      // Main note doesn't exist, feature-a is old, feature-b is recent
      const oldMtime = Date.now() - 25 * 60 * 60 * 1000;
      const recentMtime = Date.now() - 1 * 60 * 60 * 1000;

      vi.mocked(fs.stat)
        .mockRejectedValueOnce(new Error('ENOENT')) // main note
        .mockResolvedValueOnce({ mtimeMs: oldMtime } as any) // feature-a (old)
        .mockResolvedValueOnce({ mtimeMs: recentMtime } as any); // feature-b (recent)

      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(fs.rmdir).mockResolvedValue(undefined);

      await cleanupStaleNotes('/repo');

      // Should only delete feature-a's note (now at canopy/note path)
      expect(fs.unlink).toHaveBeenCalledTimes(1);
      expect(fs.unlink).toHaveBeenCalledWith('/repo/.git/worktrees/feature-a/canopy/note');
    });

    it('handles missing note files gracefully', async () => {
      vi.mocked(childProcess.execSync).mockReturnValue('/repo/.git\n');
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));

      // Should not throw
      await expect(cleanupStaleNotes('/repo')).resolves.not.toThrow();

      // No deletions
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('handles unlink failures gracefully', async () => {
      vi.mocked(childProcess.execSync).mockReturnValue('/repo/.git\n');
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

      // Old note exists
      const oldMtime = Date.now() - 25 * 60 * 60 * 1000;
      vi.mocked(fs.stat).mockResolvedValue({ mtimeMs: oldMtime } as any);

      // But deletion fails
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Permission denied'));

      // Should not throw
      await expect(cleanupStaleNotes('/repo')).resolves.not.toThrow();
    });

    it('resolves relative git directory path', async () => {
      // git rev-parse returns relative path
      vi.mocked(childProcess.execSync).mockReturnValue('.git\n');
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

      const recentMtime = Date.now() - 1 * 60 * 60 * 1000;
      vi.mocked(fs.stat).mockResolvedValue({ mtimeMs: recentMtime } as any);

      await cleanupStaleNotes('/repo/subdir');

      // Should resolve to absolute path with namespaced canopy/note
      expect(fs.stat).toHaveBeenCalledWith(expect.stringContaining('/repo/subdir/.git/canopy/note'));
    });

    it('skips non-directory entries in worktrees folder', async () => {
      vi.mocked(childProcess.execSync).mockReturnValue('/repo/.git\n');

      // One directory and one file in worktrees
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'feature-a', isDirectory: () => true },
        { name: 'some-file', isDirectory: () => false },
      ] as any);

      // Main note doesn't exist, feature-a is old
      const oldMtime = Date.now() - 25 * 60 * 60 * 1000;
      vi.mocked(fs.stat)
        .mockRejectedValueOnce(new Error('ENOENT')) // main note
        .mockResolvedValueOnce({ mtimeMs: oldMtime } as any); // feature-a

      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(fs.rmdir).mockResolvedValue(undefined);

      await cleanupStaleNotes('/repo');

      // Should only check/delete feature-a, not 'some-file' (with namespaced path)
      expect(fs.unlink).toHaveBeenCalledTimes(1);
      expect(fs.unlink).toHaveBeenCalledWith('/repo/.git/worktrees/feature-a/canopy/note');
    });
  });
});
