import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearWorktreeCache, stopWorktreeCacheCleanup, getWorktreeChangesWithStats, getCommitCount } from '../../src/utils/git.js';
import { WorktreeRemovedError } from '../../src/utils/errorTypes.js';

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
			access: vi.fn(), // Add access mock for directory existence check
		},
	};
});

describe('git.ts', () => {
	beforeEach(() => {
		clearWorktreeCache();
	});

	afterEach(() => {
		clearWorktreeCache();
	});

	// Stop cleanup interval after all tests
	afterEach(() => {
		stopWorktreeCacheCleanup();
	});

	describe('getWorktreeChangesWithStats - untracked file line counting', () => {
		let mockReadFile: any;
		let mockStat: any;

		beforeEach(async () => {
			clearWorktreeCache();
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

	describe('getWorktreeChangesWithStats - deleted directory handling', () => {
		let mockAccess: any;
		let mockStat: any;

		beforeEach(async () => {
			clearWorktreeCache();
			// Get the mocked fs module
			const fs = await import('fs');
			mockAccess = fs.promises.access as any;
			mockStat = fs.promises.stat as any;

			// Reset mocks
			vi.mocked(mockAccess).mockReset();
			vi.mocked(mockStat).mockReset();
			vi.mocked(mockStat).mockResolvedValue({ mtimeMs: Date.now() } as any);
		});

		it('throws WorktreeRemovedError when directory does not exist', async () => {
			// Mock fs.access to fail with ENOENT
			const enoentError = new Error('ENOENT: no such file or directory');
			(enoentError as NodeJS.ErrnoException).code = 'ENOENT';
			vi.mocked(mockAccess).mockRejectedValue(enoentError);

			await expect(getWorktreeChangesWithStats('/deleted/worktree', true))
				.rejects
				.toThrow(WorktreeRemovedError);
		});

		it('includes path in WorktreeRemovedError context', async () => {
			const enoentError = new Error('ENOENT: no such file or directory');
			(enoentError as NodeJS.ErrnoException).code = 'ENOENT';
			vi.mocked(mockAccess).mockRejectedValue(enoentError);

			try {
				await getWorktreeChangesWithStats('/deleted/worktree', true);
				expect.fail('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(WorktreeRemovedError);
				expect((error as WorktreeRemovedError).context?.path).toBe('/deleted/worktree');
			}
		});

		it('re-throws non-ENOENT errors without wrapping', async () => {
			// Mock fs.access to fail with permission error
			const epermError = new Error('EPERM: operation not permitted');
			(epermError as NodeJS.ErrnoException).code = 'EPERM';
			vi.mocked(mockAccess).mockRejectedValue(epermError);

			await expect(getWorktreeChangesWithStats('/protected/worktree', true))
				.rejects
				.toThrow('EPERM: operation not permitted');

			// Should NOT be a WorktreeRemovedError
			try {
				await getWorktreeChangesWithStats('/protected/worktree', true);
			} catch (error) {
				expect(error).not.toBeInstanceOf(WorktreeRemovedError);
			}
		});

		it('proceeds normally when directory exists', async () => {
			const simpleGit = await import('simple-git');
			vi.mocked(simpleGit.default).mockReturnValue({
				status: vi.fn().mockResolvedValue({
					modified: ['file.ts'],
					created: [],
					deleted: [],
					renamed: [],
					not_added: [],
					conflicted: [],
				}),
				revparse: vi.fn().mockResolvedValue('/existing/repo'),
				diff: vi.fn().mockResolvedValue('10\t5\tfile.ts'),
			} as any);

			// Mock fs.access to succeed (directory exists)
			vi.mocked(mockAccess).mockResolvedValue(undefined);

			const result = await getWorktreeChangesWithStats('/existing/repo', true);

			expect(result.changes).toHaveLength(1);
			expect(result.changes[0].status).toBe('modified');
		});
	});

	describe('getCommitCount', () => {
		it('returns commit count for valid repository', async () => {
			const simpleGit = await import('simple-git');
			vi.mocked(simpleGit.default).mockReturnValue({
				raw: vi.fn().mockResolvedValue('42\n'),
			} as any);

			const count = await getCommitCount('/mock/repo');

			expect(count).toBe(42);
		});

		it('returns 0 when git command fails', async () => {
			const simpleGit = await import('simple-git');
			vi.mocked(simpleGit.default).mockReturnValue({
				raw: vi.fn().mockRejectedValue(new Error('fatal: not a git repository')),
			} as any);

			const count = await getCommitCount('/not/a/repo');

			expect(count).toBe(0);
		});

		it('handles repositories with no commits', async () => {
			const simpleGit = await import('simple-git');
			vi.mocked(simpleGit.default).mockReturnValue({
				raw: vi.fn().mockRejectedValue(new Error('fatal: bad revision HEAD')),
			} as any);

			const count = await getCommitCount('/empty/repo');

			expect(count).toBe(0);
		});

		it('trims whitespace from git output', async () => {
			const simpleGit = await import('simple-git');
			vi.mocked(simpleGit.default).mockReturnValue({
				raw: vi.fn().mockResolvedValue('  100  \n'),
			} as any);

			const count = await getCommitCount('/mock/repo');

			expect(count).toBe(100);
		});
	});
});
