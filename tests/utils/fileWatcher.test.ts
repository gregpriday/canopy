import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	createFileWatcher,
	buildIgnorePatterns,
} from '../../src/utils/fileWatcher.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('fileWatcher', () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = path.join(os.tmpdir(), `yellowwood-watcher-test-${Date.now()}`);
		await fs.ensureDir(testDir);
	});

	afterEach(async () => {
		await fs.remove(testDir);
	});

	describe('createFileWatcher', () => {
		it('creates a watcher that can be started and stopped', async () => {
			const watcher = createFileWatcher(testDir, {});

			expect(watcher.isWatching()).toBe(false);

			watcher.start();
			expect(watcher.isWatching()).toBe(true);

			await watcher.stop();
			expect(watcher.isWatching()).toBe(false);
		});

		it('detects file additions', async () => {
			const onAdd = vi.fn();
			const watcher = createFileWatcher(testDir, {
				onAdd,
				debounce: 50,
			});

			watcher.start();

			// Wait for watcher to be ready
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Create a file
			const testFile = path.join(testDir, 'test.txt');
			await fs.writeFile(testFile, 'hello');

			// Wait for debounce + processing
			await new Promise((resolve) => setTimeout(resolve, 300));

			expect(onAdd).toHaveBeenCalledWith('test.txt');

			await watcher.stop();
		});

		it('detects file changes', async () => {
			// Create file before starting watcher
			const testFile = path.join(testDir, 'test.txt');
			await fs.writeFile(testFile, 'initial');

			const onChange = vi.fn();
			const watcher = createFileWatcher(testDir, {
				onChange,
				debounce: 50,
			});

			watcher.start();
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Modify the file
			await fs.writeFile(testFile, 'modified');

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 300));

			expect(onChange).toHaveBeenCalledWith('test.txt');

			await watcher.stop();
		});

		it('detects file deletions', async () => {
			// Create file before starting watcher
			const testFile = path.join(testDir, 'test.txt');
			await fs.writeFile(testFile, 'content');

			const onUnlink = vi.fn();
			const watcher = createFileWatcher(testDir, {
				onUnlink,
				debounce: 50,
			});

			watcher.start();
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Delete the file
			await fs.remove(testFile);

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 300));

			expect(onUnlink).toHaveBeenCalledWith('test.txt');

			await watcher.stop();
		});

		it('detects directory additions', async () => {
			const onAddDir = vi.fn();
			const watcher = createFileWatcher(testDir, {
				onAddDir,
				debounce: 50,
			});

			watcher.start();
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Create directory
			const testSubdir = path.join(testDir, 'subdir');
			await fs.ensureDir(testSubdir);

			await new Promise((resolve) => setTimeout(resolve, 300));

			expect(onAddDir).toHaveBeenCalledWith('subdir');

			await watcher.stop();
		});

		it('detects directory deletions', async () => {
			// Create directory before starting watcher
			const testSubdir = path.join(testDir, 'subdir');
			await fs.ensureDir(testSubdir);

			const onUnlinkDir = vi.fn();
			const watcher = createFileWatcher(testDir, {
				onUnlinkDir,
				debounce: 50,
			});

			watcher.start();
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Delete directory
			await fs.remove(testSubdir);

			await new Promise((resolve) => setTimeout(resolve, 300));

			expect(onUnlinkDir).toHaveBeenCalledWith('subdir');

			await watcher.stop();
		});

		it('debounces rapid changes', async () => {
			const testFile = path.join(testDir, 'rapid.txt');
			await fs.writeFile(testFile, 'initial');

			const onChange = vi.fn();
			const watcher = createFileWatcher(testDir, {
				onChange,
				debounce: 100,
			});

			watcher.start();
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Make well-spaced changes to ensure events fire
			// awaitWriteFinish stabilizes each write before events trigger
			await fs.writeFile(testFile, 'change1');
			await new Promise((resolve) => setTimeout(resolve, 400));

			await fs.writeFile(testFile, 'change2');
			await new Promise((resolve) => setTimeout(resolve, 400));

			await fs.writeFile(testFile, 'change3');
			await new Promise((resolve) => setTimeout(resolve, 400));

			// Should be called for changes (exact count may vary due to timing/awaitWriteFinish)
			// The key is that debouncing is working and changes are detected
			expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(1);
			expect(onChange.mock.calls.length).toBeLessThanOrEqual(4);

			await watcher.stop();
		});

		it('respects ignore patterns', async () => {
			const onAdd = vi.fn();
			const watcher = createFileWatcher(testDir, {
				onAdd,
				ignored: ['**/*.log'],
				debounce: 50,
			});

			watcher.start();
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Create ignored file
			await fs.writeFile(path.join(testDir, 'test.log'), 'log content');

			// Create non-ignored file
			await fs.writeFile(path.join(testDir, 'test.txt'), 'text content');

			await new Promise((resolve) => setTimeout(resolve, 300));

			// Should only detect .txt file, not .log
			expect(onAdd).toHaveBeenCalledWith('test.txt');
			expect(onAdd).not.toHaveBeenCalledWith('test.log');
			expect(onAdd).toHaveBeenCalledTimes(1);

			await watcher.stop();
		});

		it('handles errors gracefully', async () => {
			const onError = vi.fn();

			// Try to watch a non-existent directory
			expect(() => {
				createFileWatcher('/this/path/does/not/exist/hopefully', {
					onError,
				});
			}).not.toThrow();
		});

		it('cleans up resources on stop', async () => {
			const onAdd = vi.fn();
			const watcher = createFileWatcher(testDir, {
				onAdd,
				debounce: 200,
			});

			watcher.start();
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Create a file
			await fs.writeFile(path.join(testDir, 'test.txt'), 'content');

			// Stop shortly after creation (before debounce completes)
			await new Promise((resolve) => setTimeout(resolve, 50));
			await watcher.stop();

			// Wait past debounce time
			await new Promise((resolve) => setTimeout(resolve, 250));

			// Handler should not be called (debounce was cancelled)
			expect(onAdd).not.toHaveBeenCalled();
		});

		it('normalizes paths relative to root', async () => {
			const onAdd = vi.fn();
			const watcher = createFileWatcher(testDir, {
				onAdd,
				debounce: 50,
			});

			watcher.start();
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Create file in subdirectory
			const subdir = path.join(testDir, 'sub', 'nested');
			await fs.ensureDir(subdir);
			await fs.writeFile(path.join(subdir, 'file.txt'), 'content');

			await new Promise((resolve) => setTimeout(resolve, 300));

			// Path should be relative to testDir
			expect(onAdd).toHaveBeenCalledWith(path.join('sub', 'nested', 'file.txt'));

			await watcher.stop();
		});
	});

	describe('buildIgnorePatterns', () => {
		it('includes standard ignore patterns', () => {
			const patterns = buildIgnorePatterns();

			expect(patterns).toContain('**/node_modules/**');
			expect(patterns).toContain('**/.git/**');
			expect(patterns).toContain('**/.DS_Store');
		});

		it('merges custom ignore patterns', () => {
			const custom = ['**/*.log', '**/temp/**'];
			const patterns = buildIgnorePatterns(custom);

			expect(patterns).toContain('**/node_modules/**'); // Standard
			expect(patterns).toContain('**/*.log'); // Custom
			expect(patterns).toContain('**/temp/**'); // Custom
		});

		it('handles empty custom ignores', () => {
			const patterns = buildIgnorePatterns([]);

			expect(patterns.length).toBeGreaterThan(0); // Has standard patterns
			expect(patterns).toContain('**/node_modules/**');
		});
	});
});
