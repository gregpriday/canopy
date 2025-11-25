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
      mockReadFile.mockResolvedValue('line1\nline2\nline3');

      mockCreate.mockResolvedValue({
        output_text: JSON.stringify({ summary: '🔐 Adding user authentication' })
      });

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/user-auth', 'main');

      expect(result).toEqual({
        summary: '🔐 Adding user authentication',
        modifiedCount: 3
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        model: 'gpt-5-nano'
      }));
    });

    it('should return last commit message for clean worktree', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.log.mockResolvedValue({
        latest: { message: 'feat: add user dashboard\n\nDetailed description here' }
      });

      const result = await generateWorktreeSummary('/path/to/worktree', 'main', 'main');

      expect(result).toEqual({
        summary: '✅ feat: add user dashboard',
        modifiedCount: 0
      });

      // Should not call AI for clean worktree
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should handle clean worktree with no commits', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.log.mockResolvedValue({ latest: null });

      const result = await generateWorktreeSummary('/path/to/worktree', 'main', 'main');

      expect(result).toEqual({
        summary: 'Clean: main',
        modifiedCount: 0
      });

      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should return null when no AI client available and worktree has changes', async () => {
      vi.mocked(clientModule.getAIClient).mockReturnValue(null);

      mockGit.status.mockResolvedValue({
        modified: ['src/test.ts'],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toBeNull();
    });

    it('should return fallback summary when git errors occur', async () => {
      mockGit.status.mockRejectedValue(new Error('Git error'));

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

      mockCreate
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValue({ output_text: JSON.stringify({ summary: '🚀 Retry success' }) });

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

      mockCreate.mockRejectedValue(new Error('API down'));

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toEqual({
        summary: 'feature/test (analysis unavailable)',
        modifiedCount: 1
      });
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('should handle malformed JSON with resilient parsing', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['src/auth.ts'],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.diff.mockResolvedValue('@@ -1 +1 @@\n+console.log("change")');

      // Test malformed JSON with trailing comma and extra content
      mockCreate.mockResolvedValue({
        output_text: '{"summary":"🔥 Fixing critical bug",}\nExtra text that should be ignored'
      });

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toEqual({
        summary: '🔥 Fixing critical bug',
        modifiedCount: 1
      });
    });

    it('should extract summary from JSON-like text', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['src/auth.ts'],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.diff.mockResolvedValue('@@ -1 +1 @@\n+console.log("change")');

      // Test plain text that looks JSON-like
      mockCreate.mockResolvedValue({
        output_text: 'Some prefix text "summary": "🎨 Redesigning user interface" and more'
      });

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toEqual({
        summary: '🎨 Redesigning user interface',
        modifiedCount: 1
      });
    });

    it('should normalize whitespace in summary', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['src/auth.ts'],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.diff.mockResolvedValue('@@ -1 +1 @@\n+console.log("change")');

      // Test summary with extra whitespace
      mockCreate.mockResolvedValue({
        output_text: JSON.stringify({ summary: '🚀 Building  new   feature  fast' })
      });

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toEqual({
        summary: '🚀 Building new feature fast',
        modifiedCount: 1
      });
    });

    it('should handle newlines in JSON response', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['src/auth.ts'],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.diff.mockResolvedValue('@@ -1 +1 @@\n+console.log("change")');

      // Test JSON with newlines
      mockCreate.mockResolvedValue({
        output_text: '{\n"summary":"🔐 Updating authentication flow"\n}\n'
      });

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toEqual({
        summary: '🔐 Updating authentication flow',
        modifiedCount: 1
      });
    });

    it('should return mechanical summary for empty files without calling AI', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        created: ['empty-file.txt'],
        deleted: [],
        renamed: [],
        not_added: []
      });

      // Empty file returns empty diff
      mockGit.diff.mockResolvedValue('');
      mockReadFile.mockResolvedValue('');

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toEqual({
        summary: '📝 Created empty-file.txt',
        modifiedCount: 1
      });

      // Should NOT call AI for empty files
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should return mechanical summary for binary files without calling AI', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        created: ['image.png'],
        deleted: [],
        renamed: [],
        not_added: []
      });

      // Binary file returns empty diff (ignored by filter)
      mockGit.diff.mockResolvedValue('');
      mockReadFile.mockResolvedValue('binary content');

      const result = await generateWorktreeSummary('/path/to/worktree', 'feature/test', 'main');

      expect(result).toEqual({
        summary: '📝 Created image.png',
        modifiedCount: 1
      });

      // Should NOT call AI for filtered-out files
      expect(mockCreate).not.toHaveBeenCalled();
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

      mockCreate.mockResolvedValue({
        output_text: JSON.stringify({ summary: '🔒 Working on auth' })
      });

      const updateCallback = vi.fn();

      await enrichWorktreesWithSummaries(worktrees, 'main', undefined, updateCallback);

      // Should call onUpdate for each worktree (once for loading, once for complete)
      expect(updateCallback).toHaveBeenCalled();

      // Worktrees should have summaries
      expect(worktrees.every(wt => wt.summaryLoading === false)).toBe(true);
    });

    it('should NOT call onUpdate during loading phase to prevent summary flash', async () => {
      const worktrees: Worktree[] = [
        {
          id: '/path/to/feature',
          path: '/path/to/feature',
          name: 'feature',
          branch: 'feature/auth',
          isCurrent: true,
          summary: '🔧 Existing AI summary that should persist'
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

      mockCreate.mockResolvedValue({
        output_text: JSON.stringify({ summary: '🔒 New AI summary' })
      });

      const updates: Worktree[] = [];
      const updateCallback = vi.fn((wt: Worktree) => {
        updates.push({ ...wt });
      });

      await enrichWorktreesWithSummaries(worktrees, 'main', undefined, updateCallback);

      // The first update should NOT have summaryLoading: true with undefined summary
      // Instead, onUpdate should only be called once when summary is ready
      expect(updates.length).toBe(1);
      expect(updates[0].summaryLoading).toBe(false);
      expect(updates[0].summary).toBe('🔒 New AI summary');
    });

    it('should preserve existing summary when new generation fails', async () => {
      const existingSummary = '🔧 Existing AI summary that should persist';
      const worktrees: Worktree[] = [
        {
          id: '/path/to/feature',
          path: '/path/to/feature',
          name: 'feature',
          branch: 'feature/auth',
          isCurrent: true,
          summary: existingSummary
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

      // AI call fails
      mockCreate.mockRejectedValue(new Error('API error'));

      const updateCallback = vi.fn();

      await enrichWorktreesWithSummaries(worktrees, 'main', undefined, updateCallback);

      // Summary should be preserved or have a fallback, but not be undefined
      expect(worktrees[0].summary).toBeDefined();
      expect(worktrees[0].summary).not.toBe('');
      expect(worktrees[0].summaryLoading).toBe(false);
    });

    it('should not overwrite existing summary with undefined during refresh', async () => {
      const existingSummary = '🎨 Building beautiful UI components';
      const worktrees: Worktree[] = [
        {
          id: '/path/to/ui',
          path: '/path/to/ui',
          name: 'ui-feature',
          branch: 'feature/ui',
          isCurrent: true,
          summary: existingSummary,
          summaryLoading: false
        }
      ];

      mockGit.status.mockResolvedValue({
        modified: ['src/components/Button.tsx'],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.diff.mockResolvedValue('@@ -1 +1 @@\n+export const Button = () => <button>Click</button>');

      mockCreate.mockResolvedValue({
        output_text: JSON.stringify({ summary: '🔘 Adding new button component' })
      });

      // Track all state transitions
      const stateHistory: { summary: string | undefined; loading: boolean }[] = [];
      const updateCallback = vi.fn((wt: Worktree) => {
        stateHistory.push({
          summary: wt.summary,
          loading: wt.summaryLoading ?? false
        });
      });

      await enrichWorktreesWithSummaries(worktrees, 'main', undefined, updateCallback);

      // Verify no state where summary is undefined/cleared while loading
      const badState = stateHistory.find(s => s.loading && !s.summary);
      expect(badState).toBeUndefined();

      // Final state should have the new summary
      expect(worktrees[0].summary).toBe('🔘 Adding new button component');
      expect(worktrees[0].summaryLoading).toBe(false);
    });

    it('should handle initial load (no prior summary) correctly', async () => {
      // Worktree with no existing summary - simulates first load
      const worktrees: Worktree[] = [
        {
          id: '/path/to/new',
          path: '/path/to/new',
          name: 'new-feature',
          branch: 'feature/new',
          isCurrent: true
          // No summary property - initial state
        }
      ];

      mockGit.status.mockResolvedValue({
        modified: ['src/index.ts'],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.diff.mockResolvedValue('@@ -1 +1 @@\n+console.log("initial")');

      mockCreate.mockResolvedValue({
        output_text: JSON.stringify({ summary: '🚀 Starting new feature' })
      });

      const updateCallback = vi.fn();

      await enrichWorktreesWithSummaries(worktrees, 'main', undefined, updateCallback);

      // Should receive the AI-generated summary
      expect(worktrees[0].summary).toBe('🚀 Starting new feature');
      expect(worktrees[0].summaryLoading).toBe(false);
      // Callback should be called once when summary is ready
      expect(updateCallback).toHaveBeenCalledTimes(1);
    });

    it('should handle clean worktree transition (dirty->clean)', async () => {
      // Worktree that was dirty but is now clean (user committed changes)
      const worktrees: Worktree[] = [
        {
          id: '/path/to/committed',
          path: '/path/to/committed',
          name: 'committed',
          branch: 'feature/done',
          isCurrent: true,
          summary: '🔧 Previous AI summary from dirty state'
        }
      ];

      // Now the worktree is clean
      mockGit.status.mockResolvedValue({
        modified: [],
        created: [],
        deleted: [],
        renamed: [],
        not_added: []
      });

      mockGit.log.mockResolvedValue({
        latest: { message: 'feat: completed the feature\n\nDetails here' }
      });

      const updateCallback = vi.fn();

      await enrichWorktreesWithSummaries(worktrees, 'main', undefined, updateCallback);

      // Should transition to showing the commit message
      expect(worktrees[0].summary).toBe('✅ feat: completed the feature');
      expect(worktrees[0].modifiedCount).toBe(0);
      expect(worktrees[0].summaryLoading).toBe(false);
    });
  });
});
