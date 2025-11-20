import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { switchWorktree } from '../../src/utils/worktreeSwitch.js';
import type { Worktree, CanopyConfig } from '../../src/types/index.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import type { FileWatcher } from '../../src/utils/fileWatcher.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { simpleGit, SimpleGit } from 'simple-git';

describe('switchWorktree', () => {
  let testRepoPath: string;
  let mainWorktreePath: string;
  let featureWorktreePath: string;
  let git: SimpleGit;
  let createdWorktrees: string[] = [];

  beforeEach(async () => {
    // Create temp directory for test repo
    const tmpPath = path.join(os.tmpdir(), `canopy-switch-test-${Date.now()}`);
    await fs.ensureDir(tmpPath);
    testRepoPath = await fs.realpath(tmpPath);

    // Initialize git repo
    git = simpleGit(testRepoPath);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // Create initial files
    await fs.writeFile(path.join(testRepoPath, 'README.md'), '# Test');
    await fs.ensureDir(path.join(testRepoPath, 'src'));
    await fs.writeFile(path.join(testRepoPath, 'src', 'App.tsx'), 'app');
    await git.add('.');
    await git.commit('Initial commit');

    // Create feature branch and worktree
    await git.checkoutLocalBranch('feature');
    await fs.writeFile(path.join(testRepoPath, 'src', 'Feature.tsx'), 'feature');
    await git.add('.');
    await git.commit('Add feature');

    // Go back to main
    await git.checkout('main');

    // Set up worktree paths
    mainWorktreePath = testRepoPath;
    const tmpFeaturePath = path.join(os.tmpdir(), `canopy-wt-feature-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    // Create feature worktree
    await git.raw(['worktree', 'add', tmpFeaturePath, 'feature']);
    featureWorktreePath = await fs.realpath(tmpFeaturePath);
    createdWorktrees.push(featureWorktreePath);
  });

  afterEach(async () => {
    // Clean up worktrees
    for (const wtPath of createdWorktrees) {
      try {
        await git.raw(['worktree', 'remove', '--force', wtPath]);
        await fs.remove(wtPath);
      } catch (error) {
        // Worktree might already be removed
      }
    }

    // Clean up test repo
    await fs.remove(testRepoPath);

    // Reset worktrees array for next test
    createdWorktrees = [];
  });

  it('stops current watcher before switching', async () => {
    // Create mock watcher
    const mockStop = vi.fn().mockResolvedValue(undefined);
    const mockWatcher = {
      stop: mockStop,
      start: vi.fn(),
      isWatching: vi.fn().mockReturnValue(true),
    } as unknown as FileWatcher;

    const targetWorktree: Worktree = {
      id: 'feature',
      path: featureWorktreePath,
      name: 'feature',
      branch: 'feature',
      isCurrent: false,
    };

    await switchWorktree({
      targetWorktree,
      currentWatcher: mockWatcher,
      currentTree: [],
      selectedPath: null,
      config: DEFAULT_CONFIG,
      onFileChange: {},
    });

    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('builds tree for target worktree path', async () => {
    const targetWorktree: Worktree = {
      id: 'feature',
      path: featureWorktreePath,
      name: 'feature',
      branch: 'feature',
      isCurrent: false,
    };

    const result = await switchWorktree({
      targetWorktree,
      currentWatcher: null,
      currentTree: [],
      selectedPath: null,
      config: DEFAULT_CONFIG,
      onFileChange: {},
    });

    // Tree should contain files from feature worktree
    expect(result.tree.length).toBeGreaterThan(0);

    // Should have src directory
    const srcNode = result.tree.find(node => node.name === 'src');
    expect(srcNode).toBeDefined();
    expect(srcNode!.type).toBe('directory');

    // Should have Feature.tsx (only in feature branch)
    const hasFeatureFile = srcNode!.children?.some(child => child.name === 'Feature.tsx');
    expect(hasFeatureFile).toBe(true);

    // Clean up watcher
    await result.watcher.stop();
  });

  it('starts new watcher for target worktree', async () => {
    const targetWorktree: Worktree = {
      id: 'feature',
      path: featureWorktreePath,
      name: 'feature',
      branch: 'feature',
      isCurrent: false,
    };

    const result = await switchWorktree({
      targetWorktree,
      currentWatcher: null,
      currentTree: [],
      selectedPath: null,
      config: DEFAULT_CONFIG,
      onFileChange: {},
    });

    // Watcher should be returned and watching
    expect(result.watcher).toBeDefined();
    expect(result.watcher.isWatching()).toBe(true);

    // Clean up watcher
    await result.watcher.stop();
  });

  it('preserves selection when path exists in new tree', async () => {
    const targetWorktree: Worktree = {
      id: 'feature',
      path: featureWorktreePath,
      name: 'feature',
      branch: 'feature',
      isCurrent: false,
    };

    // Select a file that exists in both worktrees (using full path)
    const selectedPath = path.join(featureWorktreePath, 'src', 'App.tsx');

    const result = await switchWorktree({
      targetWorktree,
      currentWatcher: null,
      currentTree: [],
      selectedPath,
      config: DEFAULT_CONFIG,
      onFileChange: {},
    });

    // Selection should be preserved
    expect(result.selectedPath).toBe(selectedPath);

    await result.watcher.stop();
  });

  it('clears selection when path does not exist in new tree', async () => {
    const targetWorktree: Worktree = {
      id: 'main',
      path: mainWorktreePath,
      name: 'main',
      branch: 'main',
      isCurrent: false,
    };

    // Select a file that only exists in feature branch
    const selectedPath = path.join(mainWorktreePath, 'src', 'Feature.tsx');

    const result = await switchWorktree({
      targetWorktree,
      currentWatcher: null,
      currentTree: [],
      selectedPath,
      config: DEFAULT_CONFIG,
      onFileChange: {},
    });

    // Selection should be cleared (file doesn't exist in main)
    expect(result.selectedPath).toBeNull();

    await result.watcher.stop();
  });

  it('handles switching when no watcher exists', async () => {
    const targetWorktree: Worktree = {
      id: 'feature',
      path: featureWorktreePath,
      name: 'feature',
      branch: 'feature',
      isCurrent: false,
    };

    // Should not crash when currentWatcher is null
    const result = await switchWorktree({
      targetWorktree,
      currentWatcher: null,
      currentTree: [],
      selectedPath: null,
      config: DEFAULT_CONFIG,
      onFileChange: {},
    });

    expect(result.tree).toBeDefined();
    expect(result.watcher).toBeDefined();

    await result.watcher.stop();
  });

  it('passes onFileChange callbacks to new watcher', async () => {
    const targetWorktree: Worktree = {
      id: 'feature',
      path: featureWorktreePath,
      name: 'feature',
      branch: 'feature',
      isCurrent: false,
    };

    const onAdd = vi.fn();
    const onChange = vi.fn();

    const result = await switchWorktree({
      targetWorktree,
      currentWatcher: null,
      currentTree: [],
      selectedPath: null,
      config: DEFAULT_CONFIG,
      onFileChange: {
        onAdd,
        onChange,
      },
    });

    // Wait for watcher to initialize
    await new Promise(resolve => setTimeout(resolve, 200));

    // Create a file to trigger watcher
    await fs.writeFile(path.join(featureWorktreePath, 'test.txt'), 'test');

    // Wait for watcher to fire
    await new Promise(resolve => setTimeout(resolve, 400));

    // Callback should have been called
    expect(onAdd).toHaveBeenCalledWith('test.txt');

    await result.watcher.stop();
  });

  it('preserves selection with partial path matching', async () => {
    const targetWorktree: Worktree = {
      id: 'feature',
      path: featureWorktreePath,
      name: 'feature',
      branch: 'feature',
      isCurrent: false,
    };

    // Use a relative path that should match
    const selectedPath = path.join('src', 'App.tsx');

    const result = await switchWorktree({
      targetWorktree,
      currentWatcher: null,
      currentTree: [],
      selectedPath,
      config: DEFAULT_CONFIG,
      onFileChange: {},
    });

    // Selection should be preserved (endsWith matching)
    expect(result.selectedPath).toBe(selectedPath);

    await result.watcher.stop();
  });

  it('handles rapid successive switches without leaks', async () => {
    const featureWorktree: Worktree = {
      id: 'feature',
      path: featureWorktreePath,
      name: 'feature',
      branch: 'feature',
      isCurrent: false,
    };

    const mainWorktree: Worktree = {
      id: 'main',
      path: mainWorktreePath,
      name: 'main',
      branch: 'main',
      isCurrent: false,
    };

    // Switch to feature
    const result1 = await switchWorktree({
      targetWorktree: featureWorktree,
      currentWatcher: null,
      currentTree: [],
      selectedPath: null,
      config: DEFAULT_CONFIG,
      onFileChange: {},
    });

    // Immediately switch back to main
    const result2 = await switchWorktree({
      targetWorktree: mainWorktree,
      currentWatcher: result1.watcher,
      currentTree: result1.tree,
      selectedPath: result1.selectedPath,
      config: DEFAULT_CONFIG,
      onFileChange: {},
    });

    // First watcher should be stopped
    expect(result1.watcher.isWatching()).toBe(false);

    // Second watcher should be active
    expect(result2.watcher.isWatching()).toBe(true);

    // Clean up
    await result2.watcher.stop();
  });

  it('respects config options when building tree', async () => {
    // Create a hidden file in the feature worktree
    await fs.writeFile(path.join(featureWorktreePath, '.hidden'), 'hidden');

    const targetWorktree: Worktree = {
      id: 'feature',
      path: featureWorktreePath,
      name: 'feature',
      branch: 'feature',
      isCurrent: false,
    };

    // Config with showHidden = false
    const configNoHidden: CanopyConfig = {
      ...DEFAULT_CONFIG,
      showHidden: false,
    };

    const result = await switchWorktree({
      targetWorktree,
      currentWatcher: null,
      currentTree: [],
      selectedPath: null,
      config: configNoHidden,
      onFileChange: {},
    });

    // .git is always excluded via AI_CONTEXT_IGNORES
    const hasGitDir = result.tree.some(node => node.name === '.git');
    expect(hasGitDir).toBe(false);

    // Hidden file should be excluded when showHidden = false
    const hasHiddenFile = result.tree.some(node => node.name === '.hidden');
    expect(hasHiddenFile).toBe(false);

    await result.watcher.stop();
  });

  it('handles missing target worktree directory gracefully', async () => {
    const targetWorktree: Worktree = {
      id: 'missing',
      path: '/nonexistent/worktree/path',
      name: 'missing',
      branch: 'missing',
      isCurrent: false,
    };

    const result = await switchWorktree({
      targetWorktree,
      currentWatcher: null,
      currentTree: [],
      selectedPath: path.join('src', 'App.tsx'),
      config: DEFAULT_CONFIG,
      onFileChange: {},
    });

    // Tree should be empty for missing directory
    expect(result.tree).toEqual([]);

    // Selection should be cleared when tree build fails
    expect(result.selectedPath).toBeNull();

    // Watcher should still be created (even for empty directory)
    expect(result.watcher).toBeDefined();

    await result.watcher.stop();
  });

  it('passes respectGitignore config to watcher', async () => {
    const targetWorktree: Worktree = {
      id: 'feature',
      path: featureWorktreePath,
      name: 'feature',
      branch: 'feature',
      isCurrent: false,
    };

    // Test with respectGitignore = true
    const configWithGitignore: CanopyConfig = {
      ...DEFAULT_CONFIG,
      respectGitignore: true,
    };

    const result1 = await switchWorktree({
      targetWorktree,
      currentWatcher: null,
      currentTree: [],
      selectedPath: null,
      config: configWithGitignore,
      onFileChange: {},
    });

    // Watcher should be created with ignore patterns
    expect(result1.watcher).toBeDefined();

    await result1.watcher.stop();

    // Test with respectGitignore = false
    const configWithoutGitignore: CanopyConfig = {
      ...DEFAULT_CONFIG,
      respectGitignore: false,
    };

    const result2 = await switchWorktree({
      targetWorktree,
      currentWatcher: null,
      currentTree: [],
      selectedPath: null,
      config: configWithoutGitignore,
      onFileChange: {},
    });

    // Watcher should be created without ignore patterns
    expect(result2.watcher).toBeDefined();

    await result2.watcher.stop();
  });
});
