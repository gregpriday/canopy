import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getWorktrees, getCurrentWorktree } from '../../src/utils/worktree.js';
import type { Worktree } from '../../src/types/index.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { simpleGit, SimpleGit } from 'simple-git';

describe('worktree utilities', () => {
  let testRepoPath: string;
  let git: SimpleGit;
  let createdWorktrees: string[] = [];

  beforeEach(async () => {
    // Create temp directory for test repository
    const tmpPath = path.join(os.tmpdir(), `yellowwood-worktree-test-${Date.now()}`);
    await fs.ensureDir(tmpPath);
    // Resolve symlinks (e.g., /var -> /private/var on macOS)
    testRepoPath = await fs.realpath(tmpPath);

    // Initialize git repository
    git = simpleGit(testRepoPath);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // Create initial commit (required for worktrees)
    await fs.writeFile(path.join(testRepoPath, 'README.md'), '# Test Repo');
    await git.add('README.md');
    await git.commit('Initial commit');

    createdWorktrees = [];
  });

  afterEach(async () => {
    // Clean up all created worktrees first
    for (const wtPath of createdWorktrees) {
      try {
        await git.raw(['worktree', 'remove', '--force', wtPath]);
        await fs.remove(wtPath);
      } catch (error) {
        // Worktree might already be removed, ignore errors
      }
    }

    // Clean up temp directory
    await fs.remove(testRepoPath);
  });

  describe('getWorktrees', () => {
    it('returns single worktree for repository without additional worktrees', async () => {
      const worktrees = await getWorktrees(testRepoPath);

      expect(worktrees).toHaveLength(1);
      expect(worktrees[0].path).toBe(testRepoPath);
      expect(worktrees[0].branch).toBeDefined(); // Should have main or master
      expect(worktrees[0].isCurrent).toBe(false); // Not set by getWorktrees
    });

    it('returns empty array for non-git directory', async () => {
      const tmpPath = path.join(os.tmpdir(), `yellowwood-non-git-${Date.now()}`);
      await fs.ensureDir(tmpPath);
      const nonGitPath = await fs.realpath(tmpPath);

      const worktrees = await getWorktrees(nonGitPath);

      expect(worktrees).toEqual([]);

      await fs.remove(nonGitPath);
    });

    it('detects multiple worktrees', async () => {
      // Create a feature branch
      await git.checkoutLocalBranch('feature/test');
      await fs.writeFile(path.join(testRepoPath, 'feature.txt'), 'feature');
      await git.add('feature.txt');
      await git.commit('Add feature');

      // Switch back to main/master
      const branches = await git.branchLocal();
      const mainBranch = branches.all.find(b => b === 'main' || b === 'master') || branches.all[0];
      await git.checkout(mainBranch);

      // Create worktree for feature branch
      const tmpWtPath = path.join(os.tmpdir(), `yellowwood-wt-feature-${Date.now()}`);
      await git.raw(['worktree', 'add', tmpWtPath, 'feature/test']);
      // Resolve real path after git creates it
      const worktreePath = await fs.realpath(tmpWtPath);
      createdWorktrees.push(worktreePath);

      const worktrees = await getWorktrees(testRepoPath);

      expect(worktrees.length).toBeGreaterThanOrEqual(2);

      // Main worktree
      const mainWt = worktrees.find(wt => wt.path === testRepoPath);
      expect(mainWt).toBeDefined();
      expect(mainWt!.branch).toBeDefined();

      // Feature worktree
      const featureWt = worktrees.find(wt => wt.path === worktreePath);
      expect(featureWt).toBeDefined();
      expect(featureWt!.branch).toBe('feature/test');
    });

    it('handles worktree with detached HEAD', async () => {
      // Get current commit hash
      const log = await git.log({ maxCount: 1 });
      const commitHash = log.latest?.hash;

      if (!commitHash) {
        throw new Error('Could not get commit hash');
      }

      // Create worktree with detached HEAD
      const tmpWtPath = path.join(os.tmpdir(), `yellowwood-wt-detached-${Date.now()}`);
      await git.raw(['worktree', 'add', '--detach', tmpWtPath, commitHash]);
      // Resolve real path after git creates it
      const worktreePath = await fs.realpath(tmpWtPath);
      createdWorktrees.push(worktreePath);

      const worktrees = await getWorktrees(testRepoPath);

      const detachedWt = worktrees.find(wt => wt.path === worktreePath);
      expect(detachedWt).toBeDefined();
      expect(detachedWt!.branch).toBeUndefined(); // No branch in detached state
      // Test that name falls back to directory basename for detached HEAD
      expect(detachedWt!.name).toBe(path.basename(worktreePath));
    });

    it('generates stable IDs for worktrees', async () => {
      const worktrees = await getWorktrees(testRepoPath);

      expect(worktrees[0].id).toBeDefined();
      expect(worktrees[0].id).toBe(path.normalize(path.resolve(testRepoPath)));
    });

    it('generates human-readable names', async () => {
      const worktrees = await getWorktrees(testRepoPath);

      expect(worktrees[0].name).toBeDefined();
      // Name should be branch name or directory name
      expect(typeof worktrees[0].name).toBe('string');
      expect(worktrees[0].name.length).toBeGreaterThan(0);
    });

    it('works from subdirectory of repository', async () => {
      // Create subdirectory
      const subdir = path.join(testRepoPath, 'src', 'components');
      await fs.ensureDir(subdir);

      const worktrees = await getWorktrees(subdir);

      expect(worktrees.length).toBeGreaterThan(0);
      expect(worktrees[0].path).toBe(testRepoPath);
    });
  });

  describe('getCurrentWorktree', () => {
    it('identifies current worktree from cwd', async () => {
      const worktrees = await getWorktrees(testRepoPath);
      const current = getCurrentWorktree(testRepoPath, worktrees);

      expect(current).not.toBeNull();
      expect(current!.path).toBe(testRepoPath);
      expect(current!.isCurrent).toBe(true);
    });

    it('matches worktree when cwd is subdirectory', async () => {
      const subdir = path.join(testRepoPath, 'src', 'components');
      await fs.ensureDir(subdir);

      const worktrees = await getWorktrees(testRepoPath);
      const current = getCurrentWorktree(subdir, worktrees);

      expect(current).not.toBeNull();
      expect(current!.path).toBe(testRepoPath);
      expect(current!.isCurrent).toBe(true);
    });

    it('returns null when cwd is outside any worktree', async () => {
      const worktrees = await getWorktrees(testRepoPath);
      const outsidePath = '/tmp/completely/different/path';

      const current = getCurrentWorktree(outsidePath, worktrees);

      expect(current).toBeNull();
    });

    it('handles empty worktree array', async () => {
      const current = getCurrentWorktree(testRepoPath, []);

      expect(current).toBeNull();
    });

    it('prefers longer path matches for nested worktrees', async () => {
      // Create nested worktree structure
      const parentWt: Worktree = {
        id: '/Users/dev/project',
        path: '/Users/dev/project',
        name: 'main',
        branch: 'main',
        isCurrent: false,
      };

      const nestedWt: Worktree = {
        id: '/Users/dev/project/nested',
        path: '/Users/dev/project/nested',
        name: 'feature',
        branch: 'feature/nested',
        isCurrent: false,
      };

      const cwd = '/Users/dev/project/nested/src';
      const current = getCurrentWorktree(cwd, [parentWt, nestedWt]);

      // Should match nested worktree, not parent
      expect(current).not.toBeNull();
      expect(current!.path).toBe('/Users/dev/project/nested');
    });

    it('does not mutate original worktree array', async () => {
      const worktrees = await getWorktrees(testRepoPath);
      const originalWorktrees = JSON.parse(JSON.stringify(worktrees));

      getCurrentWorktree(testRepoPath, worktrees);

      expect(worktrees).toEqual(originalWorktrees);
    });

    it('returns null for path with similar prefix but different directory', async () => {
      // Test that path matching doesn't give false positives
      // e.g., /tmp/repo should not match /tmp/repo-old
      const worktrees = await getWorktrees(testRepoPath);

      // Try a path that shares a prefix but is a different directory
      const similarPath = testRepoPath + '-different';

      const current = getCurrentWorktree(similarPath, worktrees);

      expect(current).toBeNull();
    });

    it('correctly identifies current worktree when cwd is symlink', async () => {
      // Create a symlink to a subdirectory
      const subdir = path.join(testRepoPath, 'src');
      await fs.ensureDir(subdir);

      const symlinkPath = path.join(os.tmpdir(), `yellowwood-symlink-${Date.now()}`);
      await fs.symlink(subdir, symlinkPath);

      try {
        const worktrees = await getWorktrees(testRepoPath);
        const current = getCurrentWorktree(symlinkPath, worktrees);

        // Should match despite being called with symlink path
        expect(current).not.toBeNull();
        expect(current!.path).toBe(testRepoPath);
        expect(current!.isCurrent).toBe(true);
      } finally {
        // Clean up symlink
        await fs.remove(symlinkPath);
      }
    });
  });
});
