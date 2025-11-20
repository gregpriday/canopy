import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getGitStatusCached, clearGitStatusCache, stopGitStatusCacheCleanup } from '../../src/utils/git.js';
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

// Mock fs realpathSync
vi.mock('fs', () => ({
	realpathSync: vi.fn((path: string) => path),
}));

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
});
