import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateWorktreeSummary, enrichWorktreesWithSummaries } from '../../src/services/ai/worktree.js';
import type { Worktree } from '../../src/types/index.js';
import * as clientModule from '../../src/services/ai/client.js';
import simpleGit from 'simple-git';

// Mock dependencies
vi.mock('../../src/services/ai/client.js', () => ({
  getAIClient: vi.fn()
}));

vi.mock('simple-git');

describe('AI Worktree Service', () => {
  let mockCreate: any;
  let mockGit: any;

  beforeEach(() => {
    mockCreate = vi.fn();
    mockGit = {
      status: vi.fn(),
      diff: vi.fn()
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
      const mockResponse = {
        summary: 'Adding user authentication'
      };

      mockGit.status.mockResolvedValue({
        modified: ['src/auth.ts', 'src/login.ts'],
        created: ['src/middleware/auth.ts'],
        deleted: [],
        renamed: []
      });

      mockGit.diff.mockResolvedValue('src/auth.ts | 50 +++++\nsrc/login.ts | 30 +++++');

      mockCreate.mockResolvedValue({
        output_text: JSON.stringify(mockResponse)
      });

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/user-auth', 'main');

      expect(result).toEqual({
        summary: 'Adding user authentication',
        modifiedCount: 3
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        model: 'gpt-5-nano',
        text: expect.objectContaining({
          format: expect.objectContaining({
            type: 'json_schema'
          })
        })
      }));
    });

    it('should return simple summary for clean worktree', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        created: [],
        deleted: [],
        renamed: []
      });

      mockGit.diff.mockResolvedValue('');

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

    it('should handle git errors gracefully', async () => {
      mockGit.status.mockRejectedValue(new Error('Git error'));

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toBeNull();
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
        renamed: []
      });

      mockGit.diff.mockResolvedValue('file.ts | 10 +++++');

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
