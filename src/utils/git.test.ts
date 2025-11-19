import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isGitRepository, getGitStatus } from './git.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { simpleGit } from 'simple-git';
import { GitError } from './errorTypes.js';

describe('git utilities', () => {
  let testRepoPath: string;
  let nonRepoPath: string;

  beforeEach(async () => {
    // Create temp directories
    testRepoPath = path.join(os.tmpdir(), `yellowwood-git-test-${Date.now()}`);
    nonRepoPath = path.join(os.tmpdir(), `yellowwood-non-git-${Date.now()}`);

    await fs.ensureDir(testRepoPath);
    await fs.ensureDir(nonRepoPath);

    // Resolve symlinks (e.g., /var -> /private/var on macOS) to match git's behavior
    testRepoPath = fs.realpathSync(testRepoPath);
    nonRepoPath = fs.realpathSync(nonRepoPath);

    // Initialize git repo in testRepoPath
    const git = simpleGit(testRepoPath);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // Create initial commit
    await fs.writeFile(path.join(testRepoPath, 'README.md'), '# Test Repo');
    await git.add('README.md');
    await git.commit('Initial commit');
  });

  afterEach(async () => {
    await fs.remove(testRepoPath);
    await fs.remove(nonRepoPath);
  });

  describe('isGitRepository', () => {
    it('returns true for a git repository', async () => {
      const result = await isGitRepository(testRepoPath);
      expect(result).toBe(true);
    });

    it('returns false for a non-git directory', async () => {
      const result = await isGitRepository(nonRepoPath);
      expect(result).toBe(false);
    });

    it('returns true for subdirectory of git repo', async () => {
      const subdir = path.join(testRepoPath, 'subdir');
      await fs.ensureDir(subdir);

      const result = await isGitRepository(subdir);
      expect(result).toBe(true);
    });
  });

  describe('getGitStatus', () => {
    it('returns empty map for clean repository', async () => {
      const statusMap = await getGitStatus(testRepoPath);
      expect(statusMap.size).toBe(0);
    });

    it('detects modified files', async () => {
      // Modify existing file
      await fs.writeFile(path.join(testRepoPath, 'README.md'), '# Modified');

      const statusMap = await getGitStatus(testRepoPath);
      const expectedPath = path.join(testRepoPath, 'README.md');
      expect(statusMap.get(expectedPath)).toBe('modified');
    });

    it('detects untracked files', async () => {
      // Create new file (not staged)
      await fs.writeFile(path.join(testRepoPath, 'new-file.txt'), 'new');

      const statusMap = await getGitStatus(testRepoPath);
      const expectedPath = path.join(testRepoPath, 'new-file.txt');
      expect(statusMap.get(expectedPath)).toBe('untracked');
    });

    it('detects added files', async () => {
      // Create and stage new file
      const git = simpleGit(testRepoPath);
      await fs.writeFile(path.join(testRepoPath, 'staged.txt'), 'staged');
      await git.add('staged.txt');

      const statusMap = await getGitStatus(testRepoPath);
      const expectedPath = path.join(testRepoPath, 'staged.txt');
      expect(statusMap.get(expectedPath)).toBe('added');
    });

    it('detects deleted files', async () => {
      // Delete tracked file
      await fs.remove(path.join(testRepoPath, 'README.md'));

      const statusMap = await getGitStatus(testRepoPath);
      const expectedPath = path.join(testRepoPath, 'README.md');
      expect(statusMap.get(expectedPath)).toBe('deleted');
    });

    it('handles renamed files correctly', async () => {
      const git = simpleGit(testRepoPath);

      // Rename file using git mv
      await git.mv('README.md', 'README-new.md');

      const statusMap = await getGitStatus(testRepoPath);

      // Old path should be marked as deleted
      const oldPath = path.join(testRepoPath, 'README.md');
      expect(statusMap.get(oldPath)).toBe('deleted');

      // New path should be marked as added
      const newPath = path.join(testRepoPath, 'README-new.md');
      expect(statusMap.get(newPath)).toBe('added');
    });

    it('handles multiple file statuses', async () => {
      const git = simpleGit(testRepoPath);

      // Modified file
      await fs.writeFile(path.join(testRepoPath, 'README.md'), '# Modified');

      // Untracked file
      await fs.writeFile(path.join(testRepoPath, 'untracked.txt'), 'new');

      // Added file
      await fs.writeFile(path.join(testRepoPath, 'added.txt'), 'added');
      await git.add('added.txt');

      const statusMap = await getGitStatus(testRepoPath);

      expect(statusMap.get(path.join(testRepoPath, 'README.md'))).toBe('modified');
      expect(statusMap.get(path.join(testRepoPath, 'untracked.txt'))).toBe('untracked');
      expect(statusMap.get(path.join(testRepoPath, 'added.txt'))).toBe('added');
      expect(statusMap.size).toBe(3);
    });

    it('throws GitError for non-git directory', async () => {
      await expect(getGitStatus(nonRepoPath)).rejects.toThrow(GitError);
      await expect(getGitStatus(nonRepoPath)).rejects.toThrow('Failed to get git status');

      // Verify error context includes cwd
      try {
        await getGitStatus(nonRepoPath);
      } catch (error) {
        expect(error).toBeInstanceOf(GitError);
        expect((error as GitError).context?.cwd).toBe(nonRepoPath);
      }
    });

    it('returns absolute paths in the map', async () => {
      // Create untracked file
      await fs.writeFile(path.join(testRepoPath, 'test.txt'), 'test');

      const statusMap = await getGitStatus(testRepoPath);

      // Check that the path is absolute
      const keys = Array.from(statusMap.keys());
      expect(keys.length).toBe(1);
      expect(path.isAbsolute(keys[0])).toBe(true);
      expect(keys[0]).toBe(path.join(testRepoPath, 'test.txt'));
    });

    it('handles nested directory files', async () => {
      // Create file in subdirectory
      const subdir = path.join(testRepoPath, 'subdir');
      await fs.ensureDir(subdir);
      await fs.writeFile(path.join(subdir, 'nested.txt'), 'nested');

      const statusMap = await getGitStatus(testRepoPath);
      const expectedPath = path.join(testRepoPath, 'subdir', 'nested.txt');
      expect(statusMap.get(expectedPath)).toBe('untracked');
    });

    it('works when called from subdirectory', async () => {
      // Create subdirectory
      const subdir = path.join(testRepoPath, 'subdir');
      await fs.ensureDir(subdir);

      // Create modified file in root
      await fs.writeFile(path.join(testRepoPath, 'README.md'), '# Modified');

      // Call getGitStatus from subdirectory - should still see root file
      const statusMap = await getGitStatus(subdir);

      // Path should be relative to the subdirectory
      const expectedPath = path.join(subdir, '..', 'README.md');
      const normalizedPath = path.normalize(expectedPath);
      expect(statusMap.get(normalizedPath)).toBe('modified');
    });

    it('excludes clean files from the map', async () => {
      // README.md is committed and clean - should not appear in status
      const statusMap = await getGitStatus(testRepoPath);
      const readmePath = path.join(testRepoPath, 'README.md');
      expect(statusMap.has(readmePath)).toBe(false);
      expect(statusMap.size).toBe(0);
    });

    it('detects staged modifications', async () => {
      const git = simpleGit(testRepoPath);

      // Modify and stage existing file
      await fs.writeFile(path.join(testRepoPath, 'README.md'), '# Modified and staged');
      await git.add('README.md');

      const statusMap = await getGitStatus(testRepoPath);
      const expectedPath = path.join(testRepoPath, 'README.md');
      expect(statusMap.get(expectedPath)).toBe('modified');
    });

    it('handles renamed file with modifications correctly', async () => {
      const git = simpleGit(testRepoPath);

      // Rename and modify file
      await git.mv('README.md', 'README-new.md');
      await fs.writeFile(path.join(testRepoPath, 'README-new.md'), '# Modified after rename');

      const statusMap = await getGitStatus(testRepoPath);

      // Old path should be marked as deleted
      const oldPath = path.join(testRepoPath, 'README.md');
      expect(statusMap.get(oldPath)).toBe('deleted');

      // New path should be marked as modified (not just added)
      const newPath = path.join(testRepoPath, 'README-new.md');
      expect(statusMap.get(newPath)).toBe('modified');
    });

    it('handles merge conflicts', async () => {
      const git = simpleGit(testRepoPath);

      // Get the current branch name (git init creates 'master' or 'main' depending on git version)
      const currentBranch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();

      // Create a branch with a commit
      await git.checkoutLocalBranch('feature');
      await fs.writeFile(path.join(testRepoPath, 'README.md'), '# Feature branch');
      await git.add('README.md');
      await git.commit('Feature change');

      // Switch back to original branch and create conflicting commit
      await git.checkout(currentBranch);
      await fs.writeFile(path.join(testRepoPath, 'README.md'), '# Main branch');
      await git.add('README.md');
      await git.commit('Main change');

      // Attempt merge to create conflict
      try {
        await git.merge(['feature']);
      } catch (error) {
        // Merge conflict expected
      }

      const statusMap = await getGitStatus(testRepoPath);
      const expectedPath = path.join(testRepoPath, 'README.md');
      // Conflicted files should be marked as modified
      expect(statusMap.get(expectedPath)).toBe('modified');
    });

    it('handles nonexistent directory gracefully', async () => {
      const nonexistentPath = path.join(os.tmpdir(), 'yellowwood-nonexistent-dir-123456');

      // Should return false, not throw
      const isRepo = await isGitRepository(nonexistentPath);
      expect(isRepo).toBe(false);

      // getGitStatus should throw GitError for nonexistent directory
      await expect(getGitStatus(nonexistentPath)).rejects.toThrow(GitError);
      await expect(getGitStatus(nonexistentPath)).rejects.toThrow('Failed to get git status');

      // Verify error context
      try {
        await getGitStatus(nonexistentPath);
      } catch (error) {
        expect(error).toBeInstanceOf(GitError);
        expect((error as GitError).context?.cwd).toBe(nonexistentPath);
      }
    });

    it('excludes ignored files from status', async () => {
      const git = simpleGit(testRepoPath);

      // Create .gitignore
      await fs.writeFile(path.join(testRepoPath, '.gitignore'), 'ignored.txt\n');
      await git.add('.gitignore');
      await git.commit('Add gitignore');

      // Create ignored file
      await fs.writeFile(path.join(testRepoPath, 'ignored.txt'), 'ignored content');

      const statusMap = await getGitStatus(testRepoPath);
      const ignoredPath = path.join(testRepoPath, 'ignored.txt');

      // Ignored files should not appear in status map
      expect(statusMap.has(ignoredPath)).toBe(false);
    });
  });
});
