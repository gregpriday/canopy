import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateWorktreeSummary, enrichWorktreesWithSummaries } from '../../src/services/ai/worktree.js';
import type { Worktree } from '../../src/types/index.js';
import * as clientModule from '../../src/services/ai/client.js';
import simpleGit from 'simple-git';
import fs from 'fs-extra';

const { readFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn()
}));

// Mock dependencies
vi.mock('../../src/services/ai/client.js', () => ({
  getAIClient: vi.fn()
}));

vi.mock('simple-git');
vi.mock('fs-extra', () => ({
  __esModule: true,
  default: { readFile: readFileMock },
  readFile: readFileMock
}));

describe('AI Worktree Service', () => {
  let mockCreate: any;
  let mockGit: any;
  let mockReadFile: any;

  beforeEach(() => {
    mockCreate = vi.fn();
    readFileMock.mockReset();
    mockReadFile = vi.mocked(fs.readFile);
    mockGit = {
      status: vi.fn(),
      diff: vi.fn(),
      log: vi.fn()
    };

    vi.mocked(clientModule.getAIClient).mockReturnValue({
      responses: {
        create: mockCreate
      }
    } as any);

    vi.mocked(simpleGit).mockReturnValue(mockGit as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('generateWorktreeSummary', () => {
    it('should generate summary for worktree with changes', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['src/auth.ts', 'src/login.ts'],
        created: ['src/middleware/auth.ts'],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.diff.mockResolvedValue('@@ -1 +1 @@\n+console.log("change")');
      mockGit.log.mockResolvedValue({ latest: { message: 'Setup auth base' } });
      mockReadFile.mockResolvedValue('line1\nline2\nline3');

      mockCreate.mockResolvedValue({
        output_text: '🚧 Adding user authentication\nSome extra text'
      });

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/user-auth', 'main');

      expect(result).toEqual({
        summary: '🚧 Adding user authentication',
        modifiedCount: 3
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        model: 'gpt-5-nano'
      }));
    });

    it('should return simple summary for clean worktree', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.diff.mockResolvedValue('');
      mockGit.log.mockResolvedValue({ latest: { message: 'Previous commit' } });

      const result = await generateWorktreeSummary('/path/to/worktree', 'main', 'main');

      expect(result).toEqual({
        summary: 'Clean: main',
        modifiedCount: 0
      });

      // Should not call AI for clean worktree
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should return null when no AI client available', async () => {
      vi.mocked(clientModule.getAIClient).mockReturnValue(null);

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toBeNull();
    });

    it('should return fallback summary when git errors occur', async () => {
      mockGit.status.mockRejectedValue(new Error('Git error'));
      mockGit.log.mockResolvedValue({ latest: { message: 'Previous commit' } });

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toEqual({
        summary: 'feature/test (git unavailable)',
        modifiedCount: 0
      });
    });

    it('retries AI generation and succeeds on a later attempt', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['src/auth.ts'],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.diff.mockResolvedValue('@@ -1 +1 @@\n+console.log("retry")');
      mockGit.log.mockResolvedValue({ latest: { message: 'Previous commit' } });

      mockCreate
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValue({ output_text: '🚀 Retry success' });

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toEqual({
        summary: '🚀 Retry success',
        modifiedCount: 1
      });
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('returns a resilient fallback when retries fail', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['src/auth.ts'],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.diff.mockResolvedValue('@@ -1 +1 @@\n+console.log("fallback")');
      mockGit.log.mockResolvedValue({ latest: { message: 'Previous commit' } });

      mockCreate.mockRejectedValue(new Error('API down'));

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toEqual({
        summary: 'feature/test (analysis unavailable)',
        modifiedCount: 1
      });
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });
  });

  describe('enrichWorktreesWithSummaries', () => {
    it('should enrich multiple worktrees in parallel', async () => {
      const worktrees: Worktree[] = [
        {
          id: '/path/to/main',
          path: '/path/to/main',
          name: 'main',
          branch: 'main',
          isCurrent: true
        },
        {
          id: '/path/to/feature',
          path: '/path/to/feature',
          name: 'feature',
          branch: 'feature/auth',
          isCurrent: false
        }
      ];

      mockGit.status.mockResolvedValue({
        modified: ['file.ts'],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.diff.mockResolvedValue('@@ -1 +1 @@\n+console.log("change")');
      mockGit.log.mockResolvedValue({ latest: { message: 'Previous commit' } });

      mockCreate.mockResolvedValue({
        output_text: JSON.stringify({ summary: 'Working on auth' })
      });

      const updateCallback = vi.fn();

      await enrichWorktreesWithSummaries(worktrees, 'main', updateCallback);

      // Should call onUpdate for each worktree (once for loading, once for complete)
      expect(updateCallback).toHaveBeenCalled();

      // Worktrees should have summaries
      expect(worktrees.every(wt => wt.summaryLoading === false)).toBe(true);
    });
  });
});
