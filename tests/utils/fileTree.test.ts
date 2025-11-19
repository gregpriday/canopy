import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildFileTree, clearDirCache } from '../../src/utils/fileTree.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import type { CanopyConfig } from '../../src/types/index.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

let dirCounter = 0;

describe('buildFileTree', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temp directory for tests
    testDir = path.join(os.tmpdir(), `canopy-tree-test-${Date.now()}-${dirCounter++}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    // Clean up
    await fs.remove(testDir);
    clearDirCache();
  });

  it('builds tree for empty directory', async () => {
    const tree = await buildFileTree(testDir, DEFAULT_CONFIG);
    expect(tree).toEqual([]);
  });

  it('builds tree with files at root level', async () => {
    await fs.writeFile(path.join(testDir, 'file1.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'file2.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      showFileSize: true,
      showModifiedTime: true,
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree).toHaveLength(2);
    expect(tree[0].name).toBe('file1.txt');
    expect(tree[0].type).toBe('file');
    expect(tree[0].depth).toBe(0);
    expect(tree[0].path).toBe(path.join(testDir, 'file1.txt'));
    expect(tree[0].size).toBeGreaterThan(0);
    expect(tree[0].modified).toBeInstanceOf(Date);
  });

  it('builds tree with nested directories', async () => {
    await fs.ensureDir(path.join(testDir, 'dir1'));
    await fs.writeFile(path.join(testDir, 'dir1', 'file.txt'), 'content');

    const tree = await buildFileTree(testDir, DEFAULT_CONFIG);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('dir1');
    expect(tree[0].type).toBe('directory');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].name).toBe('file.txt');
    expect(tree[0].children![0].depth).toBe(1);
  });

  it('respects maxDepth configuration', async () => {
    // Create nested structure: dir1/dir2/dir3/file.txt
    await fs.ensureDir(path.join(testDir, 'dir1', 'dir2', 'dir3'));
    await fs.writeFile(path.join(testDir, 'dir1', 'dir2', 'dir3', 'file.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      maxDepth: 1,
    };

    const tree = await buildFileTree(testDir, config);

    // Should have dir1 with dir2 as child, but dir3 should not be loaded
    expect(tree[0].name).toBe('dir1');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].name).toBe('dir2');
    expect(tree[0].children![0].children).toEqual([]); // Depth limit reached
  });

  it('hides hidden files when showHidden is false', async () => {
    await fs.writeFile(path.join(testDir, 'visible.txt'), 'content');
    await fs.writeFile(path.join(testDir, '.hidden.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      showHidden: false,
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('visible.txt');
  });

  it('shows hidden files when showHidden is true', async () => {
    await fs.writeFile(path.join(testDir, 'visible.txt'), 'content');
    await fs.writeFile(path.join(testDir, '.hidden.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      showHidden: true,
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree).toHaveLength(2);
    const names = tree.map(n => n.name).sort();
    expect(names).toContain('.hidden.txt');
    expect(names).toContain('visible.txt');
  });

  it('sorts by name in ascending order', async () => {
    await fs.writeFile(path.join(testDir, 'zebra.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'apple.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'banana.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      sortBy: 'name',
      sortDirection: 'asc',
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree.map(n => n.name)).toEqual(['apple.txt', 'banana.txt', 'zebra.txt']);
  });

  it('sorts by name in descending order', async () => {
    await fs.writeFile(path.join(testDir, 'zebra.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'apple.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      sortBy: 'name',
      sortDirection: 'desc',
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree.map(n => n.name)).toEqual(['zebra.txt', 'apple.txt']);
  });

  it('sorts directories before files', async () => {
    await fs.ensureDir(path.join(testDir, 'zdir'));
    await fs.writeFile(path.join(testDir, 'afile.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      sortBy: 'name',
      sortDirection: 'asc',
    };

    const tree = await buildFileTree(testDir, config);

    // Directory 'zdir' should come before file 'afile.txt' even though z > a
    expect(tree[0].name).toBe('zdir');
    expect(tree[0].type).toBe('directory');
    expect(tree[1].name).toBe('afile.txt');
    expect(tree[1].type).toBe('file');
  });

  it('respects customIgnores patterns', async () => {
    await fs.writeFile(path.join(testDir, 'keep.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'ignore.log'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      customIgnores: ['*.log'],
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('keep.txt');
  });

  it('respects .gitignore patterns', async () => {
    // Create .gitignore
    await fs.writeFile(path.join(testDir, '.gitignore'), 'ignored.txt\n*.log\n');
    await fs.writeFile(path.join(testDir, 'keep.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'ignored.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'file.log'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      respectGitignore: true,
      showHidden: true, // Show .gitignore itself
    };

    const tree = await buildFileTree(testDir, config);

    const names = tree.map(n => n.name);
    expect(names).toContain('keep.txt');
    expect(names).toContain('.gitignore');
    expect(names).not.toContain('ignored.txt');
    expect(names).not.toContain('file.log');
  });

  it('returns empty array for non-existent directory', async () => {
    const nonExistent = path.join(testDir, 'does-not-exist');
    const tree = await buildFileTree(nonExistent, DEFAULT_CONFIG);

    expect(tree).toEqual([]);
  });

  it('handles very nested directory structure', async () => {
    // Create deeply nested structure
    let currentPath = testDir;
    for (let i = 0; i < 10; i++) {
      currentPath = path.join(currentPath, `level${i}`);
      await fs.ensureDir(currentPath);
    }
    await fs.writeFile(path.join(currentPath, 'deep.txt'), 'content');

    const tree = await buildFileTree(testDir, DEFAULT_CONFIG);

    // Should have full depth
    let current = tree[0];
    for (let i = 0; i < 10; i++) {
      expect(current.name).toBe(`level${i}`);
      expect(current.depth).toBe(i);
      if (i < 9) {
        current = current.children![0];
      }
    }
  });

  it('handles natural sorting for file names with numbers', async () => {
    await fs.writeFile(path.join(testDir, 'file2.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'file10.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'file1.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      sortBy: 'name',
      sortDirection: 'asc',
    };

    const tree = await buildFileTree(testDir, config);

    // Natural sort should be: file1.txt, file2.txt, file10.txt
    expect(tree.map(n => n.name)).toEqual(['file1.txt', 'file2.txt', 'file10.txt']);
  });

  it('sorts by size', async () => {
    await fs.writeFile(path.join(testDir, 'small.txt'), 'a');
    await fs.writeFile(path.join(testDir, 'large.txt'), 'a'.repeat(100));
    await fs.writeFile(path.join(testDir, 'medium.txt'), 'a'.repeat(50));

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      sortBy: 'size',
      sortDirection: 'asc',
      showFileSize: true,
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree.map(n => n.name)).toEqual(['small.txt', 'medium.txt', 'large.txt']);
  });

  it('sorts by modified time', async () => {
    await fs.writeFile(path.join(testDir, 'first.txt'), 'content');
    await new Promise(resolve => setTimeout(resolve, 10));
    await fs.writeFile(path.join(testDir, 'second.txt'), 'content');
    await new Promise(resolve => setTimeout(resolve, 10));
    await fs.writeFile(path.join(testDir, 'third.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      sortBy: 'modified',
      sortDirection: 'asc',
      showModifiedTime: true,
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree.map(n => n.name)).toEqual(['first.txt', 'second.txt', 'third.txt']);
  });

  it('initializes expanded to false', async () => {
    await fs.ensureDir(path.join(testDir, 'dir1'));

    const tree = await buildFileTree(testDir, DEFAULT_CONFIG);

    expect(tree[0].expanded).toBe(false);
  });

  it('handles directories with mixed content', async () => {
    await fs.ensureDir(path.join(testDir, 'dir1'));
    await fs.ensureDir(path.join(testDir, 'dir2'));
    await fs.writeFile(path.join(testDir, 'file1.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'file2.txt'), 'content');

    const tree = await buildFileTree(testDir, DEFAULT_CONFIG);

    // Directories should come first
    expect(tree[0].type).toBe('directory');
    expect(tree[1].type).toBe('directory');
    expect(tree[2].type).toBe('file');
    expect(tree[3].type).toBe('file');
  });

  it('handles maxDepth of 0', async () => {
    await fs.ensureDir(path.join(testDir, 'dir1'));
    await fs.writeFile(path.join(testDir, 'dir1', 'file.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'root.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      maxDepth: 0,
    };

    const tree = await buildFileTree(testDir, config);

    // Should only have root level entries
    expect(tree).toHaveLength(2);
    const dir = tree.find(n => n.type === 'directory');
    expect(dir?.children).toEqual([]); // No children loaded
  });

  it('excludes .git directory always', async () => {
    // Create .git directory and a file
    await fs.ensureDir(path.join(testDir, '.git'));
    await fs.writeFile(path.join(testDir, 'file.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      showHidden: false,
    };

    const tree = await buildFileTree(testDir, config);

    const names = tree.map(n => n.name);
    expect(names).not.toContain('.git'); // Now excluded by AI_CONTEXT_IGNORES
    expect(names).toContain('file.txt');
  });

  it('handles empty gitignore file', async () => {
    await fs.writeFile(path.join(testDir, '.gitignore'), '');
    await fs.writeFile(path.join(testDir, 'file.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      respectGitignore: true,
      showHidden: true,
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree).toHaveLength(2);
  });

  it('handles gitignore with comments', async () => {
    await fs.writeFile(path.join(testDir, '.gitignore'), '# Comment\nignored.txt\n# Another comment\n');
    await fs.writeFile(path.join(testDir, 'ignored.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'keep.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      respectGitignore: true,
      showHidden: true,
    };

    const tree = await buildFileTree(testDir, config);

    const names = tree.map(n => n.name);
    expect(names).not.toContain('ignored.txt');
    expect(names).toContain('keep.txt');
  });

  it('handles multiple custom ignore patterns', async () => {
    await fs.writeFile(path.join(testDir, 'keep.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'ignore.log'), 'content');
    await fs.writeFile(path.join(testDir, 'ignore.tmp'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      customIgnores: ['*.log', '*.tmp'],
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('keep.txt');
  });

  it('handles sorting by type', async () => {
    await fs.ensureDir(path.join(testDir, 'dir1'));
    await fs.writeFile(path.join(testDir, 'file1.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      sortBy: 'type',
    };

    const tree = await buildFileTree(testDir, config);

    // Directories first, then files
    expect(tree[0].type).toBe('directory');
    expect(tree[1].type).toBe('file');
  });

  it('returns empty array when root path is a file', async () => {
    const rootFile = path.join(testDir, 'root-file.txt');
    await fs.writeFile(rootFile, 'content');

    const tree = await buildFileTree(rootFile, DEFAULT_CONFIG);

    expect(tree).toEqual([]);
  });

  it('supports ? wildcards in custom ignore patterns', async () => {
    await fs.writeFile(path.join(testDir, 'file1.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'file10.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      customIgnores: ['file?.txt'],
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree.map(n => n.name)).toEqual(['file10.txt']);
  });

  it('sorts by size in descending order', async () => {
    await fs.writeFile(path.join(testDir, 'small.txt'), 'a');
    await fs.writeFile(path.join(testDir, 'large.txt'), 'a'.repeat(100));

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      sortBy: 'size',
      sortDirection: 'desc',
      showFileSize: true,
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree.map(n => n.name)).toEqual(['large.txt', 'small.txt']);
  });

  it('sorts by modified time in descending order', async () => {
    await fs.writeFile(path.join(testDir, 'first.txt'), 'content');
    await new Promise(resolve => setTimeout(resolve, 10));
    await fs.writeFile(path.join(testDir, 'second.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      sortBy: 'modified',
      sortDirection: 'desc',
      showModifiedTime: true,
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree.map(n => n.name)).toEqual(['second.txt', 'first.txt']);
  });

  it('handles special regex characters in pattern names', async () => {
    await fs.writeFile(path.join(testDir, '[test].txt'), 'content');
    await fs.writeFile(path.join(testDir, '(foo).txt'), 'content');
    await fs.writeFile(path.join(testDir, 'normal.txt'), 'content');

    const config: CanopyConfig = {
      ...DEFAULT_CONFIG,
      customIgnores: ['[test].txt', '(foo).txt'],
    };

    const tree = await buildFileTree(testDir, config);

    expect(tree.map(n => n.name)).toEqual(['normal.txt']);
  });
});
