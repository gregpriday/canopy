import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractIssueNumber, extractIssueNumberSync, clearIssueCache } from '../../src/services/ai/issueExtractor.js';
import * as clientModule from '../../src/services/ai/client.js';

// Mock dependencies
vi.mock('../../src/services/ai/client.js', () => ({
  getAIClient: vi.fn()
}));

describe('Issue Extractor Service', () => {
  let mockCreate: any;

  beforeEach(() => {
    clearIssueCache();
    mockCreate = vi.fn();
    vi.mocked(clientModule.getAIClient).mockReturnValue({
      responses: {
        create: mockCreate
      }
    } as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('extractIssueNumberSync', () => {
    it('should extract issue number from feature/issue-158-description pattern', () => {
      expect(extractIssueNumberSync('feature/issue-158-terminal-busy-feedback')).toBe(158);
    });

    it('should extract issue number from fix/issue-42-login-bug pattern', () => {
      expect(extractIssueNumberSync('fix/issue-42-login-bug')).toBe(42);
    });

    it('should extract issue number from bugfix/issue-100-fix pattern', () => {
      expect(extractIssueNumberSync('bugfix/issue-100-fix-something')).toBe(100);
    });

    it('should extract issue number from feature/issues/123 pattern', () => {
      expect(extractIssueNumberSync('feature/issues/123')).toBe(123);
    });

    it('should extract issue number from branch/#456-description pattern', () => {
      expect(extractIssueNumberSync('feature/#456-add-feature')).toBe(456);
    });

    it('should extract issue number from GH-42 pattern', () => {
      expect(extractIssueNumberSync('fix/GH-42-login-bug')).toBe(42);
    });

    it('should extract issue number from gh-123 pattern (lowercase)', () => {
      expect(extractIssueNumberSync('feature/gh-123-add-feature')).toBe(123);
    });

    it('should extract issue number from jira-456 pattern', () => {
      expect(extractIssueNumberSync('feature/jira-456-task')).toBe(456);
    });

    it('should be case insensitive for issue keyword', () => {
      expect(extractIssueNumberSync('feature/ISSUE-200-uppercase')).toBe(200);
      expect(extractIssueNumberSync('feature/Issue-201-mixed')).toBe(201);
    });

    it('should return null for main branch', () => {
      expect(extractIssueNumberSync('main')).toBeNull();
    });

    it('should return null for master branch', () => {
      expect(extractIssueNumberSync('master')).toBeNull();
    });

    it('should return null for develop branch', () => {
      expect(extractIssueNumberSync('develop')).toBeNull();
    });

    it('should return null for staging branch', () => {
      expect(extractIssueNumberSync('staging')).toBeNull();
    });

    it('should return null for release/ prefixed branches', () => {
      expect(extractIssueNumberSync('release/v1.0.0')).toBeNull();
    });

    it('should return null for branches without issue pattern', () => {
      expect(extractIssueNumberSync('feature/add-dark-mode')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractIssueNumberSync('')).toBeNull();
    });

    it('should return null for null input', () => {
      expect(extractIssueNumberSync(null as any)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(extractIssueNumberSync(undefined as any)).toBeNull();
    });

    it('should handle whitespace-only input', () => {
      expect(extractIssueNumberSync('   ')).toBeNull();
    });

    it('should handle branches with trailing/leading whitespace', () => {
      expect(extractIssueNumberSync('  feature/issue-99-test  ')).toBe(99);
    });
  });

  describe('extractIssueNumber (async with AI fallback)', () => {
    it('should use regex first and not call AI for standard patterns', async () => {
      const result = await extractIssueNumber('feature/issue-158-description');

      expect(result).toBe(158);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should cache results to avoid redundant calls', async () => {
      const result1 = await extractIssueNumber('feature/issue-300-test');
      const result2 = await extractIssueNumber('feature/issue-300-test');

      expect(result1).toBe(300);
      expect(result2).toBe(300);
      // Both should come from cache, AI never called
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should use regex for GH- pattern and not call AI', async () => {
      const result = await extractIssueNumber('feature/GH-789-bug-fix');

      expect(result).toBe(789);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should fall back to AI for unusual branch patterns when AI is available', async () => {
      mockCreate.mockResolvedValue({
        output_text: JSON.stringify({ issueNumber: 999 })
      });

      const result = await extractIssueNumber('feature/ticket-999-unusual-pattern');

      expect(result).toBe(999);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        model: 'gpt-5-nano'
      }));
    });

    it('should return null when AI is unavailable for unusual patterns', async () => {
      vi.mocked(clientModule.getAIClient).mockReturnValue(null);

      const result = await extractIssueNumber('feature/ticket-789-unusual-pattern');

      expect(result).toBeNull();
    });

    it('should return null when AI returns null', async () => {
      mockCreate.mockResolvedValue({
        output_text: JSON.stringify({ issueNumber: null })
      });

      const result = await extractIssueNumber('feature/no-issue-here');

      expect(result).toBeNull();
    });

    it('should handle AI API errors gracefully', async () => {
      mockCreate.mockRejectedValue(new Error('API error'));

      const result = await extractIssueNumber('feature/ticket-789-api-error');

      expect(result).toBeNull();
    });

    it('should handle malformed AI response gracefully', async () => {
      mockCreate.mockResolvedValue({
        output_text: 'not valid json'
      });

      const result = await extractIssueNumber('feature/ticket-789-bad-json');

      expect(result).toBeNull();
    });

    it('should extract from AI response with regex fallback for malformed JSON', async () => {
      mockCreate.mockResolvedValue({
        output_text: '{"issueNumber": 555, extra: invalid}'
      });

      const result = await extractIssueNumber('feature/unusual-pattern-here');

      // Should use regex fallback to extract 555 from the malformed JSON
      expect(result).toBe(555);
    });

    it('should skip AI for standard skip branches', async () => {
      const branches = ['main', 'master', 'develop', 'staging', 'production'];

      for (const branch of branches) {
        clearIssueCache(); // Clear cache between tests
        const result = await extractIssueNumber(branch);
        expect(result).toBeNull();
        expect(mockCreate).not.toHaveBeenCalled();
      }
    });
  });

  describe('clearIssueCache', () => {
    it('should clear the cache and allow re-extraction', async () => {
      // First extraction
      const result1 = await extractIssueNumber('feature/issue-500-test');
      expect(result1).toBe(500);

      // Clear cache
      clearIssueCache();

      // Second extraction should still work (cache miss, then cache hit)
      const result2 = await extractIssueNumber('feature/issue-500-test');
      expect(result2).toBe(500);
    });
  });

  describe('folder name support', () => {
    describe('extractIssueNumberSync with folderName', () => {
      it('should extract issue number from folder when branch has no issue', () => {
        expect(extractIssueNumberSync('feature/add-dark-mode', 'issue-99-dark-mode')).toBe(99);
      });

      it('should prefer branch issue number over folder issue number', () => {
        expect(extractIssueNumberSync('feature/issue-42-login', 'issue-99-backup')).toBe(42);
      });

      it('should extract from folder with GH- pattern', () => {
        expect(extractIssueNumberSync('feature/new-feature', 'GH-123-worktree')).toBe(123);
      });

      it('should extract from folder with jira- pattern', () => {
        expect(extractIssueNumberSync('feature/task', 'jira-456-folder')).toBe(456);
      });

      it('should handle null folder name', () => {
        expect(extractIssueNumberSync('feature/issue-100-test', undefined)).toBe(100);
      });

      it('should handle empty folder name', () => {
        expect(extractIssueNumberSync('feature/issue-100-test', '')).toBe(100);
      });

      it('should return null when neither branch nor folder have issue', () => {
        expect(extractIssueNumberSync('feature/add-dark-mode', 'my-worktree')).toBeNull();
      });

      it('should handle folder with # pattern', () => {
        expect(extractIssueNumberSync('feature/fix', '#789-bugfix')).toBe(789);
      });
    });

    describe('extractIssueNumber with folderName', () => {
      it('should use regex on folder and not call AI for standard patterns', async () => {
        const result = await extractIssueNumber('feature/no-issue', 'issue-200-folder');

        expect(result).toBe(200);
        expect(mockCreate).not.toHaveBeenCalled();
      });

      it('should cache results with folder name in cache key', async () => {
        const result1 = await extractIssueNumber('feature/add-mode', 'issue-300-test');
        const result2 = await extractIssueNumber('feature/add-mode', 'issue-300-test');

        expect(result1).toBe(300);
        expect(result2).toBe(300);
        expect(mockCreate).not.toHaveBeenCalled();
      });

      it('should use different cache keys for same branch with different folders', async () => {
        clearIssueCache();
        const result1 = await extractIssueNumber('feature/work', 'issue-100-folder');
        clearIssueCache();
        const result2 = await extractIssueNumber('feature/work', 'issue-200-folder');

        expect(result1).toBe(100);
        expect(result2).toBe(200);
      });

      it('should fall back to AI with folder context for unusual patterns', async () => {
        mockCreate.mockResolvedValue({
          output_text: JSON.stringify({ issueNumber: 777 })
        });

        const result = await extractIssueNumber('feature/unusual', 'ticket-777-folder');

        expect(result).toBe(777);
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.stringContaining('Branch: feature/unusual')
        }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
          input: expect.stringContaining('Folder: ticket-777-folder')
        }));
      });

      it('should not include folder in AI input when folder matches branch', async () => {
        mockCreate.mockResolvedValue({
          output_text: JSON.stringify({ issueNumber: null })
        });

        await extractIssueNumber('feature/unusual', 'feature/unusual');

        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
          input: 'Branch: feature/unusual'
        }));
      });
    });
  });
});
