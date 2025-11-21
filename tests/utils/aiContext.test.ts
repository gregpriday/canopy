import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gatherContext } from '../../src/utils/aiContext.js';
import simpleGit from 'simple-git';
import fs from 'fs-extra';

// Mock dependencies
vi.mock('simple-git');
vi.mock('fs-extra');
vi.mock('globby', () => ({
  globby: vi.fn().mockResolvedValue([])
}));

import { globby } from 'globby';

describe('gatherContext', () => {
  const mockRootPath = '/test/repo';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(globby).mockResolvedValue([]);
  });

  it('should sort files by mtime descending and limit to 5 files', async () => {
    // Setup: 7 files with different modification times
    const now = new Date('2024-01-15T12:00:00Z');
    const filesWithDates = [
      { file: 'file1.ts', mtime: new Date(now.getTime() - 6000) }, // 6s ago
      { file: 'file2.ts', mtime: new Date(now.getTime() - 5000) }, // 5s ago
      { file: 'file3.ts', mtime: new Date(now.getTime() - 1000) }, // 1s ago (newest)
      { file: 'file4.ts', mtime: new Date(now.getTime() - 4000) }, // 4s ago
      { file: 'file5.ts', mtime: new Date(now.getTime() - 3000) }, // 3s ago
      { file: 'file6.ts', mtime: new Date(now.getTime() - 2000) }, // 2s ago
      { file: 'file7.ts', mtime: new Date(now.getTime() - 7000) }, // 7s ago (oldest)
    ];

    const mockGit = {
      status: vi.fn().mockResolvedValue({
        modified: filesWithDates.map(f => f.file),
        created: [],
        not_added: [],
        deleted: [],
        renamed: []
      }),
      diff: vi.fn().mockImplementation((args) => {
        const file = args[2]; // ['HEAD', '--', 'filename.ts']
        return Promise.resolve(`diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,1 +1,1 @@\n-old\n+new\n`);
      })
    };

    (simpleGit as any).mockReturnValue(mockGit);
    (fs.stat as any).mockImplementation((filePath: string) => {
      const filename = filePath.split('/').pop();
      const fileData = filesWithDates.find(f => f.file === filename);
      return Promise.resolve({ mtime: fileData?.mtime });
    });

    const result = await gatherContext(mockRootPath);

    // Verify diff was called exactly 5 times (for the 5 most recent files)
    expect(mockGit.diff).toHaveBeenCalledTimes(5);

    // Expected order: file3 (1s), file6 (2s), file5 (3s), file4 (4s), file2 (5s)
    // file1 (6s) and file7 (7s) should be excluded
    expect(mockGit.diff).toHaveBeenNthCalledWith(1, ['HEAD', '--', 'file3.ts']);
    expect(mockGit.diff).toHaveBeenNthCalledWith(2, ['HEAD', '--', 'file6.ts']);
    expect(mockGit.diff).toHaveBeenNthCalledWith(3, ['HEAD', '--', 'file5.ts']);
    expect(mockGit.diff).toHaveBeenNthCalledWith(4, ['HEAD', '--', 'file4.ts']);
    expect(mockGit.diff).toHaveBeenNthCalledWith(5, ['HEAD', '--', 'file2.ts']);

    expect(result.diff).toContain('file3.ts');
    expect(result.diff).toContain('file6.ts');
    expect(result.diff).not.toContain('file1.ts');
    expect(result.diff).not.toContain('file7.ts');
  });

  it('should handle fewer than 5 files', async () => {
    const mockGit = {
      status: vi.fn().mockResolvedValue({
        modified: ['file1.ts', 'file2.ts'],
        created: [],
        not_added: [],
        deleted: [],
        renamed: []
      }),
      diff: vi.fn().mockResolvedValue('diff content')
    };

    (simpleGit as any).mockReturnValue(mockGit);
    (fs.stat as any).mockResolvedValue({ mtime: new Date() });

    const result = await gatherContext(mockRootPath);

    // Should call diff for all 2 files, not 5
    expect(mockGit.diff).toHaveBeenCalledTimes(2);
    expect(result.diff).toBeTruthy();
  });

  it('should handle mixed file statuses (modified, created, untracked)', async () => {
    const now = new Date();
    const mockGit = {
      status: vi.fn().mockResolvedValue({
        modified: ['modified.ts'],
        created: ['created.ts'],
        not_added: ['untracked.ts'],
        deleted: [],
        renamed: []
      }),
      diff: vi.fn().mockResolvedValue('diff content')
    };

    (simpleGit as any).mockReturnValue(mockGit);
    (fs.stat as any).mockResolvedValue({ mtime: now });

    const result = await gatherContext(mockRootPath);

    // Should process all three types of files
    expect(mockGit.diff).toHaveBeenCalledTimes(3);
    expect(mockGit.diff).toHaveBeenCalledWith(['HEAD', '--', 'modified.ts']);
    expect(mockGit.diff).toHaveBeenCalledWith(['HEAD', '--', 'created.ts']);
    expect(mockGit.diff).toHaveBeenCalledWith(['HEAD', '--', 'untracked.ts']);
  });

  it('should include files that cannot be stat\'d with epoch timestamp', async () => {
    const mockGit = {
      status: vi.fn().mockResolvedValue({
        modified: ['existing.ts', 'deleted.ts'],
        created: [],
        not_added: [],
        deleted: [],
        renamed: []
      }),
      diff: vi.fn().mockResolvedValue('diff content')
    };

    (simpleGit as any).mockReturnValue(mockGit);
    (fs.stat as any).mockImplementation((filePath: string) => {
      if (filePath.includes('deleted.ts')) {
        return Promise.reject(new Error('ENOENT: no such file or directory'));
      }
      return Promise.resolve({ mtime: new Date() });
    });

    const result = await gatherContext(mockRootPath);

    // Should call diff for both files (deleted file gets epoch timestamp and goes to back of queue)
    expect(mockGit.diff).toHaveBeenCalledTimes(2);
    expect(mockGit.diff).toHaveBeenCalledWith(['HEAD', '--', 'existing.ts']);
    expect(mockGit.diff).toHaveBeenCalledWith(['HEAD', '--', 'deleted.ts']);
  });

  it('should truncate diff to 10k characters', async () => {
    const largeDiff = 'x'.repeat(15000);
    const mockGit = {
      status: vi.fn().mockResolvedValue({
        modified: ['large.ts'],
        created: [],
        not_added: [],
        deleted: [],
        renamed: []
      }),
      diff: vi.fn().mockResolvedValue(largeDiff)
    };

    (simpleGit as any).mockReturnValue(mockGit);
    (fs.stat as any).mockResolvedValue({ mtime: new Date() });

    const result = await gatherContext(mockRootPath);

    expect(result.diff.length).toBeLessThanOrEqual(10000 + 50); // +50 for truncation message
    expect(result.diff).toContain('(diff truncated)');
  });

  it('should handle empty repository (no changes)', async () => {
    const mockGit = {
      status: vi.fn().mockResolvedValue({
        modified: [],
        created: [],
        not_added: [],
        deleted: [],
        renamed: []
      }),
      diff: vi.fn().mockResolvedValue('')
    };

    (simpleGit as any).mockReturnValue(mockGit);

    const result = await gatherContext(mockRootPath);

    expect(mockGit.diff).not.toHaveBeenCalled();
    expect(result.diff).toBe('');
  });

  it('should gracefully handle git errors', async () => {
    const mockGit = {
      status: vi.fn().mockRejectedValue(new Error('Git error: not a git repository')),
      diff: vi.fn()
    };

    (simpleGit as any).mockReturnValue(mockGit);

    const result = await gatherContext(mockRootPath);

    // Should return empty diff on git errors
    expect(result.diff).toBe('');
    expect(mockGit.diff).not.toHaveBeenCalled();
  });

  it('should handle untracked files that have no diff against HEAD', async () => {
    const mockGit = {
      status: vi.fn().mockResolvedValue({
        modified: [],
        created: [],
        not_added: ['newfile.ts'],
        deleted: [],
        renamed: []
      }),
      diff: vi.fn().mockImplementation((args) => {
        // git diff HEAD -- newfile.ts returns empty for untracked files
        if (args[0] === 'HEAD') {
          return Promise.resolve('');
        }
        // git diff -- newfile.ts also returns empty
        return Promise.resolve('');
      })
    };

    (simpleGit as any).mockReturnValue(mockGit);
    (fs.stat as any).mockResolvedValue({ mtime: new Date() });
    (fs.readFile as any).mockResolvedValue('const x = 1;\nconst y = 2;');

    const result = await gatherContext(mockRootPath);

    // Should fall back to reading the file content
    expect(result.diff).toContain('New file: newfile.ts');
    expect(result.diff).toContain('const x = 1;');
  });

  it('should capture README content up to 2k chars', async () => {
    vi.mocked(globby).mockResolvedValue(['/test/repo/README.md']);

    const mockGit = {
      status: vi.fn().mockResolvedValue({
        modified: [],
        created: [],
        not_added: [],
        deleted: [],
        renamed: []
      }),
      diff: vi.fn()
    };

    (simpleGit as any).mockReturnValue(mockGit);
    (fs.stat as any).mockResolvedValue({ mtime: new Date() });
    (fs.readFile as any).mockImplementation((filePath: string) => {
      if (filePath.endsWith('README.md')) {
        return Promise.resolve('x'.repeat(2500));
      }
      return Promise.resolve('content');
    });

    const result = await gatherContext(mockRootPath);

    expect(globby).toHaveBeenCalledWith(
      ['README.md', 'readme.md', 'README.txt'],
      expect.objectContaining({
        cwd: mockRootPath,
        deep: 1,
        absolute: true
      })
    );
    expect(result.readme.length).toBeLessThanOrEqual(2000);
    expect(result.readme).toEqual('x'.repeat(2000));
  });
});
