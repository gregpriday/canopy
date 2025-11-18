import { describe, it, expect } from 'vitest';
import { filterTreeByName, filterTreeByGitStatus } from '../../src/utils/filter.js';
import type { TreeNode, GitStatus } from '../../src/types/index.js';

// Helper to create test nodes
function createFile(name: string, path: string, gitStatus?: GitStatus): TreeNode {
  return {
    name,
    path,
    type: 'file',
    depth: 0,
    gitStatus,
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

describe('filterTreeByName', () => {
  it('returns full tree when pattern is empty', () => {
    const tree: TreeNode[] = [
      createFile('file1.ts', '/file1.ts'),
      createFile('file2.ts', '/file2.ts'),
    ];

    expect(filterTreeByName(tree, '')).toEqual(tree);
    expect(filterTreeByName(tree, '   ')).toEqual(tree); // whitespace only
  });

  it('filters files by exact name match', () => {
    const tree: TreeNode[] = [
      createFile('app.ts', '/app.ts'),
      createFile('test.ts', '/test.ts'),
    ];

    const result = filterTreeByName(tree, 'app');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('app.ts');
  });

  it('filters files with fuzzy matching', () => {
    const tree: TreeNode[] = [
      createFile('components.ts', '/components.ts'),
      createFile('utilities.ts', '/utilities.ts'),
    ];

    // 'cmp' should match 'components'
    const result = filterTreeByName(tree, 'cmp');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('components.ts');
  });

  it('is case-insensitive', () => {
    const tree: TreeNode[] = [
      createFile('README.md', '/README.md'),
      createFile('test.ts', '/test.ts'),
    ];

    const result = filterTreeByName(tree, 'readme');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('README.md');
  });

  it('preserves parent folders when child matches', () => {
    const tree: TreeNode[] = [
      createFolder('src', '/src', [
        createFile('app.ts', '/src/app.ts'),
        createFile('test.ts', '/src/test.ts'),
      ]),
    ];

    const result = filterTreeByName(tree, 'app');
    expect(result).toHaveLength(1); // src folder
    expect(result[0].type).toBe('directory');
    expect(result[0].name).toBe('src');
    expect(result[0].children).toHaveLength(1); // app.ts
    expect(result[0].children![0].name).toBe('app.ts');
  });

  it('includes folder if folder name matches', () => {
    const tree: TreeNode[] = [
      createFolder('components', '/components', [
        createFile('Button.tsx', '/components/Button.tsx'),
        createFile('Input.tsx', '/components/Input.tsx'),
      ]),
    ];

    const result = filterTreeByName(tree, 'comp');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('components');
    expect(result[0].children).toHaveLength(2); // Includes all children when folder matches
    expect(result[0].children![0].name).toBe('Button.tsx');
    expect(result[0].children![1].name).toBe('Input.tsx');
    // Verify deep clone creates new objects
    expect(result[0]).not.toBe(tree[0]);
    expect(result[0].children![0]).not.toBe(tree[0].children![0]);
  });

  it('excludes folders with no matching descendants', () => {
    const tree: TreeNode[] = [
      createFolder('src', '/src', [
        createFile('app.ts', '/src/app.ts'),
      ]),
      createFolder('tests', '/tests', [
        createFile('test.ts', '/tests/test.ts'),
      ]),
    ];

    const result = filterTreeByName(tree, 'app');
    expect(result).toHaveLength(1); // Only src folder
    expect(result[0].name).toBe('src');
  });

  it('handles deeply nested structures', () => {
    const tree: TreeNode[] = [
      createFolder('src', '/src', [
        createFolder('components', '/src/components', [
          createFolder('ui', '/src/components/ui', [
            createFile('Button.tsx', '/src/components/ui/Button.tsx'),
          ]),
        ]),
      ]),
    ];

    const result = filterTreeByName(tree, 'button');

    // Should preserve full hierarchy: src > components > ui > Button.tsx
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('src');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].name).toBe('components');
    expect(result[0].children![0].children).toHaveLength(1);
    expect(result[0].children![0].children![0].name).toBe('ui');
    expect(result[0].children![0].children![0].children).toHaveLength(1);
    expect(result[0].children![0].children![0].children![0].name).toBe('Button.tsx');
  });

  it('does not mutate original tree', () => {
    const tree: TreeNode[] = [
      createFile('app.ts', '/app.ts'),
      createFile('test.ts', '/test.ts'),
    ];

    const originalLength = tree.length;
    filterTreeByName(tree, 'app');

    expect(tree.length).toBe(originalLength); // Original unchanged
  });

  it('handles empty tree', () => {
    const result = filterTreeByName([], 'pattern');
    expect(result).toEqual([]);
  });

  it('returns empty array when pattern matches nothing', () => {
    const tree: TreeNode[] = [
      createFile('app.ts', '/app.ts'),
      createFile('test.ts', '/test.ts'),
    ];

    const result = filterTreeByName(tree, 'xyz');
    expect(result).toEqual([]);
  });

  it('fuzzy match fails for out-of-order characters', () => {
    const tree: TreeNode[] = [
      createFile('abc.ts', '/abc.ts'),
      createFile('test.ts', '/test.ts'),
    ];

    // 'ca' has 'c' after 'a' in pattern, but in 'abc.ts' 'c' comes after 'a'
    // so this should fail because we need sequential match
    const result = filterTreeByName(tree, 'ca');
    expect(result).toEqual([]);
  });

  it('matches pattern in file name (not full path)', () => {
    // Pattern matches anywhere in the name (not the full path)
    const tree: TreeNode[] = [
      createFile('app.component.ts', '/app.component.ts'),
      createFile('test.spec.ts', '/test.spec.ts'),
    ];

    const result = filterTreeByName(tree, 'comp');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('app.component.ts');
  });
});

describe('filterTreeByGitStatus', () => {
  it('filters files by git status', () => {
    const tree: TreeNode[] = [
      createFile('modified.ts', '/modified.ts', 'modified'),
      createFile('added.ts', '/added.ts', 'added'),
      createFile('clean.ts', '/clean.ts'),
    ];

    const result = filterTreeByGitStatus(tree, 'modified');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('modified.ts');
  });

  it('preserves parent folders when child has matching status', () => {
    const tree: TreeNode[] = [
      createFolder('src', '/src', [
        createFile('modified.ts', '/src/modified.ts', 'modified'),
        createFile('clean.ts', '/src/clean.ts'),
      ]),
    ];

    const result = filterTreeByGitStatus(tree, 'modified');
    expect(result).toHaveLength(1); // src folder
    expect(result[0].type).toBe('directory');
    expect(result[0].children).toHaveLength(1); // Only modified.ts
    expect(result[0].children![0].name).toBe('modified.ts');
  });

  it('excludes folders with no matching children', () => {
    const tree: TreeNode[] = [
      createFolder('src', '/src', [
        createFile('modified.ts', '/src/modified.ts', 'modified'),
      ]),
      createFolder('tests', '/tests', [
        createFile('clean.ts', '/tests/clean.ts'),
      ]),
    ];

    const result = filterTreeByGitStatus(tree, 'modified');
    expect(result).toHaveLength(1); // Only src
    expect(result[0].name).toBe('src');
  });

  it('handles multiple git status types', () => {
    const tree: TreeNode[] = [
      createFile('modified.ts', '/modified.ts', 'modified'),
      createFile('added.ts', '/added.ts', 'added'),
      createFile('deleted.ts', '/deleted.ts', 'deleted'),
      createFile('untracked.ts', '/untracked.ts', 'untracked'),
    ];

    expect(filterTreeByGitStatus(tree, 'modified')).toHaveLength(1);
    expect(filterTreeByGitStatus(tree, 'added')).toHaveLength(1);
    expect(filterTreeByGitStatus(tree, 'deleted')).toHaveLength(1);
    expect(filterTreeByGitStatus(tree, 'untracked')).toHaveLength(1);
  });

  it('excludes files without git status', () => {
    const tree: TreeNode[] = [
      createFile('modified.ts', '/modified.ts', 'modified'),
      createFile('clean.ts', '/clean.ts'), // No gitStatus property
    ];

    const result = filterTreeByGitStatus(tree, 'modified');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('modified.ts');
  });

  it('handles deeply nested structures', () => {
    const tree: TreeNode[] = [
      createFolder('src', '/src', [
        createFolder('components', '/src/components', [
          createFile('Button.tsx', '/src/components/Button.tsx', 'modified'),
          createFile('Input.tsx', '/src/components/Input.tsx'),
        ]),
      ]),
    ];

    const result = filterTreeByGitStatus(tree, 'modified');

    // Should preserve hierarchy: src > components > Button.tsx
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('src');
    expect(result[0].children![0].name).toBe('components');
    expect(result[0].children![0].children).toHaveLength(1);
    expect(result[0].children![0].children![0].name).toBe('Button.tsx');
  });

  it('does not mutate original tree', () => {
    const tree: TreeNode[] = [
      createFile('modified.ts', '/modified.ts', 'modified'),
      createFile('clean.ts', '/clean.ts'),
    ];

    const originalLength = tree.length;
    filterTreeByGitStatus(tree, 'modified');

    expect(tree.length).toBe(originalLength);
  });

  it('handles empty tree', () => {
    const result = filterTreeByGitStatus([], 'modified');
    expect(result).toEqual([]);
  });

  it('returns empty array when no git statuses match', () => {
    const tree: TreeNode[] = [
      createFile('clean.ts', '/clean.ts'),
      createFile('another.ts', '/another.ts'),
    ];

    const result = filterTreeByGitStatus(tree, 'modified');
    expect(result).toEqual([]);
  });

  it('ignores directory git status when no children match', () => {
    const tree: TreeNode[] = [
      {
        name: 'src',
        path: '/src',
        type: 'directory',
        depth: 0,
        gitStatus: 'modified', // Directory has status but no matching children
        children: [
          createFile('clean.ts', '/src/clean.ts'), // No status
        ],
      },
    ];

    const result = filterTreeByGitStatus(tree, 'modified');
    expect(result).toEqual([]); // Folder excluded because children don't match
  });
});

describe('combined filtering', () => {
  it('can apply both name and git status filters', () => {
    const tree: TreeNode[] = [
      createFile('app.component.ts', '/app.component.ts', 'modified'),
      createFile('app.service.ts', '/app.service.ts'),
      createFile('test.component.ts', '/test.component.ts', 'modified'),
    ];

    // First filter by name
    const nameFiltered = filterTreeByName(tree, 'app');
    // Then filter by git status
    const result = filterTreeByGitStatus(nameFiltered, 'modified');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('app.component.ts');
  });

  it('order of filters does not matter for final result', () => {
    const tree: TreeNode[] = [
      createFile('app.ts', '/app.ts', 'modified'),
      createFile('test.ts', '/test.ts', 'modified'),
    ];

    const nameFirst = filterTreeByGitStatus(filterTreeByName(tree, 'app'), 'modified');
    const statusFirst = filterTreeByName(filterTreeByGitStatus(tree, 'modified'), 'app');

    expect(nameFirst).toEqual(statusFirst);
  });
});

describe('edge cases', () => {
  it('handles folders with no children array', () => {
    const tree: TreeNode[] = [
      { name: 'empty', path: '/empty', type: 'directory', depth: 0 },
    ];

    expect(filterTreeByName(tree, 'empty')).toHaveLength(1);
  });

  it('handles special characters in pattern', () => {
    const tree: TreeNode[] = [
      createFile('app.spec.ts', '/app.spec.ts'),
      createFile('app.test.ts', '/app.test.ts'),
    ];

    const result = filterTreeByName(tree, 'spec');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('app.spec.ts');
  });

  it('handles unicode characters', () => {
    const tree: TreeNode[] = [
      createFile('日本語.ts', '/日本語.ts'),
      createFile('english.ts', '/english.ts'),
    ];

    const result = filterTreeByName(tree, '日本');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('日本語.ts');
  });

  it('handles very long patterns', () => {
    const tree: TreeNode[] = [
      createFile('a'.repeat(1000) + '.ts', '/long.ts'),
    ];

    const result = filterTreeByName(tree, 'a'.repeat(100));
    expect(result).toHaveLength(1);
  });

  it('preserves node properties when filtering', () => {
    const tree: TreeNode[] = [
      {
        name: 'app.ts',
        path: '/app.ts',
        type: 'file',
        depth: 0,
        size: 1024,
        modified: new Date('2025-01-01'),
        expanded: true,
        gitStatus: 'modified',
      },
    ];

    const result = filterTreeByName(tree, 'app');
    expect(result[0].size).toBe(1024);
    expect(result[0].modified).toEqual(new Date('2025-01-01'));
    expect(result[0].expanded).toBe(true);
    expect(result[0].gitStatus).toBe('modified');
  });
});
