import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getGitStatusCached, clearGitStatusCache, stopGitStatusCacheCleanup, getWorktreeChangesWithStats } from '../../src/utils/git.js';
import type { GitStatus } from '../../src/types/index.js';

// Mock simple-git
vi.mock('simple-git', () => ({
	default: vi.fn(() => ({
		checkIsRepo: vi.fn().mockResolvedValue(true),
		status: vi.fn().mockResolvedValue({
			modified: ['file1.ts'],
			created: [],
			deleted: [],
			renamed: [],
			not_added: [],
			conflicted: [],
		}),
		revparse: vi.fn().mockResolvedValue('/mock/repo'),
	})),
}));

// Mock fs realpathSync and fs.promises
// Note: vi.mock is hoisted, so we need to create mocks inside the factory
vi.mock('fs', async () => {
	const { vi } = await import('vitest');
	return {
		realpathSync: vi.fn((path: string) => path),
		promises: {
			readFile: vi.fn(),
			stat: vi.fn(),
		},
	};
});

describe('git.ts', () => {
	beforeEach(() => {
		clearGitStatusCache();
	});

	afterEach(() => {
		clearGitStatusCache();
	});

	// Stop cleanup interval after all tests
	afterEach(() => {
		stopGitStatusCacheCleanup();
	});

	describe('getGitStatusCached', () => {
		it('returns a new Map instance on cache hit (React reference equality)', async () => {
			const cwd = '/test/repo';

			// First call - cache miss, should fetch from git
			const firstResult = await getGitStatusCached(cwd);
			expect(firstResult).toBeInstanceOf(Map);
			expect(firstResult.size).toBeGreaterThan(0);

			// Second call - cache hit, should return a NEW Map instance with same data
			const secondResult = await getGitStatusCached(cwd);
			expect(secondResult).toBeInstanceOf(Map);

			// CRITICAL TEST: These should be different Map instances
			expect(secondResult).not.toBe(firstResult);

			// But should have the same contents
			expect(secondResult.size).toBe(firstResult.size);
			for (const [key, value] of firstResult.entries()) {
				expect(secondResult.get(key)).toBe(value);
			}
		});

		it('returns a new Map instance on force refresh', async () => {
			const cwd = '/test/repo';

			// Prime the cache
			const firstResult = await getGitStatusCached(cwd, false);

			// Force refresh should bypass cache and return new instance
			const secondResult = await getGitStatusCached(cwd, true);

			// Should be different instances
			expect(secondResult).not.toBe(firstResult);
		});

		it('preserves Map values correctly when cloning from cache', async () => {
			const cwd = '/test/repo';

			// Prime the cache
			const firstResult = await getGitStatusCached(cwd, false);
			const firstEntries = Array.from(firstResult.entries());

			// Get cached result
			const secondResult = await getGitStatusCached(cwd, false);
			const secondEntries = Array.from(secondResult.entries());

			// Should have same entries (deep equality)
			expect(secondEntries).toEqual(firstEntries);

			// Verify GitStatus values are preserved
			for (const [path, status] of secondResult.entries()) {
				expect(firstResult.get(path)).toBe(status);
				expect(['modified', 'added', 'deleted', 'untracked', 'ignored'].includes(status)).toBe(true);
			}
		});

		it('handles cache invalidation correctly', async () => {
			const cwd = '/test/repo';

			// Prime the cache
			await getGitStatusCached(cwd, false);

			// Clear cache
			clearGitStatusCache();

			// Next call should fetch fresh data (cache miss)
			const result = await getGitStatusCached(cwd, false);
			expect(result).toBeInstanceOf(Map);
		});
	});

	describe('getWorktreeChangesWithStats - untracked file line counting', () => {
		let mockReadFile: any;
		let mockStat: any;

		beforeEach(async () => {
			clearGitStatusCache();
			// Get the mocked fs module
			const fs = await import('fs');
			mockReadFile = fs.promises.readFile as any;
			mockStat = fs.promises.stat as any;

			// Reset and setup default behavior
			vi.mocked(mockReadFile).mockReset();
			vi.mocked(mockStat).mockReset();
			vi.mocked(mockStat).mockResolvedValue({ mtimeMs: Date.now() } as any);
		});

		it('counts lines for untracked files with content', async () => {
			// Mock simple-git to return untracked file
			const simpleGit = await import('simple-git');
			vi.mocked(simpleGit.default).mockReturnValue({
				status: vi.fn().mockResolvedValue({
					modified: [],
					created: [],
					deleted: [],
					renamed: [],
					not_added: ['newfile.ts'],
					conflicted: [],
				}),
				revparse: vi.fn().mockResolvedValue('/mock/repo'),
				diff: vi.fn().mockResolvedValue(''), // Empty diff for untracked files
			} as any);

			// Mock file read with 10 lines (each ending with \n)
			vi.mocked(mockReadFile).mockResolvedValue(Buffer.from('line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\n'));

			const result = await getWorktreeChangesWithStats('/mock/repo', true);

			expect(result.changes).toHaveLength(1);
			const change = result.changes[0];
			expect(change.status).toBe('untracked');
			expect(change.insertions).toBe(10); // 10 newlines = 10 lines
			expect(change.deletions).toBeNull();
		});

		it('counts empty untracked file as 0 lines', async () => {
			const simpleGit = await import('simple-git');
			vi.mocked(simpleGit.default).mockReturnValue({
				status: vi.fn().mockResolvedValue({
					modified: [],
					created: [],
					deleted: [],
					renamed: [],
					not_added: ['empty.ts'],
					conflicted: [],
				}),
				revparse: vi.fn().mockResolvedValue('/mock/repo'),
				diff: vi.fn().mockResolvedValue(''),
			} as any);

			// Mock empty file
			vi.mocked(mockReadFile).mockResolvedValue(Buffer.from(''));

			const result = await getWorktreeChangesWithStats('/mock/repo', true);

			expect(result.changes).toHaveLength(1);
			const change = result.changes[0];
			expect(change.status).toBe('untracked');
			expect(change.insertions).toBe(0);
			expect(change.deletions).toBeNull();
		});

		it('handles file read errors gracefully', async () => {
			const simpleGit = await import('simple-git');
			vi.mocked(simpleGit.default).mockReturnValue({
				status: vi.fn().mockResolvedValue({
					modified: [],
					created: [],
					deleted: [],
					renamed: [],
					not_added: ['unreadable.bin'],
					conflicted: [],
				}),
				revparse: vi.fn().mockResolvedValue('/mock/repo'),
				diff: vi.fn().mockResolvedValue(''),
			} as any);

			// Mock file read failure (e.g., binary file, permission error)
			vi.mocked(mockReadFile).mockRejectedValue(new Error('EACCES: permission denied'));

			const result = await getWorktreeChangesWithStats('/mock/repo', true);

			expect(result.changes).toHaveLength(1);
			const change = result.changes[0];
			expect(change.status).toBe('untracked');
			expect(change.insertions).toBeNull(); // Should fall back to null
			expect(change.deletions).toBeNull();
		});

		it('preserves existing behavior for staged files', async () => {
			const simpleGit = await import('simple-git');
			vi.mocked(simpleGit.default).mockReturnValue({
				status: vi.fn().mockResolvedValue({
					modified: [],
					created: ['staged.ts'],
					deleted: [],
					renamed: [],
					not_added: [],
					conflicted: [],
				}),
				revparse: vi.fn().mockResolvedValue('/mock/repo'),
				// Mock diff output for staged file
				diff: vi.fn().mockResolvedValue('50\t10\tstaged.ts'),
			} as any);

			const result = await getWorktreeChangesWithStats('/mock/repo', true);

			expect(result.changes).toHaveLength(1);
			const change = result.changes[0];
			expect(change.status).toBe('added');
			expect(change.insertions).toBe(50); // From git diff, not filesystem
			expect(change.deletions).toBe(10);
			// fs.readFile should NOT be called for staged files
			expect(vi.mocked(mockReadFile)).not.toHaveBeenCalled();
		});

		it('handles mixed tracked and untracked files correctly', async () => {
			const simpleGit = await import('simple-git');
			vi.mocked(simpleGit.default).mockReturnValue({
				status: vi.fn().mockResolvedValue({
					modified: ['modified.ts'],
					created: [],
					deleted: [],
					renamed: [],
					not_added: ['untracked.ts'],
					conflicted: [],
				}),
				revparse: vi.fn().mockResolvedValue('/mock/repo'),
				diff: vi.fn().mockResolvedValue('30\t5\tmodified.ts'),
			} as any);

			// Mock file read for untracked file (3 lines with trailing newline)
			vi.mocked(mockReadFile).mockResolvedValue(Buffer.from('line1\nline2\nline3\n'));

			const result = await getWorktreeChangesWithStats('/mock/repo', true);

			expect(result.changes).toHaveLength(2);

			const modifiedChange = result.changes.find(c => c.path.endsWith('modified.ts'));
			expect(modifiedChange?.status).toBe('modified');
			expect(modifiedChange?.insertions).toBe(30);
			expect(modifiedChange?.deletions).toBe(5);

			const untrackedChange = result.changes.find(c => c.path.endsWith('untracked.ts'));
			expect(untrackedChange?.status).toBe('untracked');
			expect(untrackedChange?.insertions).toBe(3); // 3 newlines = 3 lines
			expect(untrackedChange?.deletions).toBeNull();
		});

		it('handles file without trailing newline correctly', async () => {
			const simpleGit = await import('simple-git');
			vi.mocked(simpleGit.default).mockReturnValue({
				status: vi.fn().mockResolvedValue({
					modified: [],
					created: [],
					deleted: [],
					renamed: [],
					not_added: ['no-trailing-newline.ts'],
					conflicted: [],
				}),
				revparse: vi.fn().mockResolvedValue('/mock/repo'),
				diff: vi.fn().mockResolvedValue(''),
			} as any);

			// Mock file without trailing newline (3 lines)
			vi.mocked(mockReadFile).mockResolvedValue(Buffer.from('line1\nline2\nline3'));

			const result = await getWorktreeChangesWithStats('/mock/repo', true);

			expect(result.changes).toHaveLength(1);
			const change = result.changes[0];
			expect(change.status).toBe('untracked');
			expect(change.insertions).toBe(3); // 2 newlines + 1 for final line = 3 lines
			expect(change.deletions).toBeNull();
		});

		it('detects and rejects binary files', async () => {
			const simpleGit = await import('simple-git');
			vi.mocked(simpleGit.default).mockReturnValue({
				status: vi.fn().mockResolvedValue({
					modified: [],
					created: [],
					deleted: [],
					renamed: [],
					not_added: ['image.png'],
					conflicted: [],
				}),
				revparse: vi.fn().mockResolvedValue('/mock/repo'),
				diff: vi.fn().mockResolvedValue(''),
			} as any);

			// Mock binary file (contains NUL byte)
			const binaryContent = Buffer.alloc(100);
			binaryContent[50] = 0; // NUL byte at position 50
			vi.mocked(mockReadFile).mockResolvedValue(binaryContent);

			const result = await getWorktreeChangesWithStats('/mock/repo', true);

			expect(result.changes).toHaveLength(1);
			const change = result.changes[0];
			expect(change.status).toBe('untracked');
			expect(change.insertions).toBeNull(); // Binary files return null
			expect(change.deletions).toBeNull();
		});
	});
});
