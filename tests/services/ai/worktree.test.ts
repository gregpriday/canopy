import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateWorktreeSummary } from '../../../src/services/ai/worktree.js';
import { getAIClient } from '../../../src/services/ai/client.js';
import simpleGit from 'simple-git';

// Mocks
vi.mock('simple-git');
vi.mock('../../../src/services/ai/client.js');

describe('generateWorktreeSummary', () => {
  const mockGit = {
    status: vi.fn(),
    log: vi.fn(),
    diff: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(simpleGit).mockReturnValue(mockGit as any);
  });

  it('CRITICAL: Returns last commit message immediately for clean worktree (Zero-cost mode)', async () => {
    // Setup clean status
    mockGit.status.mockResolvedValue({
      modified: [],
      created: [],
      deleted: [],
      renamed: [],
      not_added: [],
    });

    // Setup git log response
    mockGit.log.mockResolvedValue({
      latest: { message: 'feat: implementing critical fix\n\nBody text' },
    });

    const result = await generateWorktreeSummary('/path', 'main');

    // Assertions
    expect(result).toEqual({
      summary: '💾 feat: implementing critical fix',
      modifiedCount: 0,
    });

    // Verify AI was NOT called
    expect(getAIClient).not.toHaveBeenCalled();
    // Verify git log WAS called
    expect(mockGit.log).toHaveBeenCalledWith({ maxCount: 1 });
  });

  it('Returns fallback message when no commits exist', async () => {
    // Setup clean status
    mockGit.status.mockResolvedValue({
      modified: [],
      created: [],
      deleted: [],
      renamed: [],
      not_added: [],
    });

    // Setup git log with no commits
    mockGit.log.mockResolvedValue({
      latest: null,
    });

    const result = await generateWorktreeSummary('/path', 'test-branch');

    expect(result).toEqual({
      summary: 'Clean: test-branch',
      modifiedCount: 0,
    });

    // Verify AI was NOT called
    expect(getAIClient).not.toHaveBeenCalled();
  });

  it('Calls AI client when files are modified', async () => {
    // Setup dirty status
    mockGit.status.mockResolvedValue({
      modified: ['src/App.tsx'],
      created: [],
      deleted: [],
      renamed: [],
      not_added: [],
    });

    // Mock diff for the modified file
    mockGit.diff.mockResolvedValue(`
diff --git a/src/App.tsx b/src/App.tsx
+++ b/src/App.tsx
+export function newFeature() { return true; }
    `);

    // Mock AI Client - match the expected response format from extractOutputText
    const mockCreate = vi.fn().mockResolvedValue({
      output: [{
        content: [{
          text: JSON.stringify({ summary: '✨ Updated App component' }),
        }],
      }],
    });
    vi.mocked(getAIClient).mockReturnValue({ responses: { create: mockCreate } } as any);

    const result = await generateWorktreeSummary('/path', 'main');

    // Verify AI WAS called
    expect(mockCreate).toHaveBeenCalled();
    expect(result?.summary).toContain('Updated App component');
  });

  it('Returns mechanical summary for empty files', async () => {
    // Setup dirty status with one new file
    mockGit.status.mockResolvedValue({
      modified: [],
      created: ['empty.md'],
      deleted: [],
      renamed: [],
      not_added: [],
    });

    // Don't mock AI client to test the empty diff guard
    vi.mocked(getAIClient).mockReturnValue({} as any);

    const result = await generateWorktreeSummary('/path', 'main');

    // Should return mechanical summary, not call AI
    expect(result?.summary).toMatch(/Created empty\.md/);
  });

  it('Handles git errors gracefully', async () => {
    // Setup git.status to throw
    mockGit.status.mockRejectedValue(new Error('Git not available'));

    const result = await generateWorktreeSummary('/path', 'main');

    // Should return fallback message
    expect(result?.summary).toMatch(/unavailable/);
  });
});
