import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearTerminalScreen } from '../../src/utils/terminal.js';

describe('terminal utilities', () => {
	let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
	let originalIsTTY: boolean | undefined;
	let originalWritable: boolean | undefined;

	beforeEach(() => {
		stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		originalIsTTY = process.stdout.isTTY;
		originalWritable = process.stdout.writable;
		// Set TTY to true by default for tests that expect writes
		Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
		Object.defineProperty(process.stdout, 'writable', { value: true, configurable: true });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		// Restore original values
		Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
		Object.defineProperty(process.stdout, 'writable', { value: originalWritable, configurable: true });
	});

	describe('clearTerminalScreen', () => {
		it('should write ANSI reset escape sequence to stdout', () => {
			clearTerminalScreen();

			expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
			expect(stdoutWriteSpy).toHaveBeenCalledWith('\x1Bc');
		});

		it('should use ESC c (full terminal reset) sequence', () => {
			clearTerminalScreen();

			const calledWith = stdoutWriteSpy.mock.calls[0]?.[0];
			expect(calledWith).toBe('\x1Bc'); // ESC c - full reset
		});

		it('should not write when stdout is not a TTY', () => {
			Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

			clearTerminalScreen();

			expect(stdoutWriteSpy).not.toHaveBeenCalled();
		});

		it('should not write when stdout is not writable', () => {
			Object.defineProperty(process.stdout, 'writable', { value: false, configurable: true });

			clearTerminalScreen();

			expect(stdoutWriteSpy).not.toHaveBeenCalled();
		});

		it('should not write when stdout is null/undefined', () => {
			const originalStdout = process.stdout;
			Object.defineProperty(process, 'stdout', { value: null, configurable: true });

			clearTerminalScreen();

			expect(stdoutWriteSpy).not.toHaveBeenCalled();

			// Restore stdout
			Object.defineProperty(process, 'stdout', { value: originalStdout, configurable: true });
		});

		it('should swallow errors when write fails', () => {
			stdoutWriteSpy.mockImplementation(() => {
				throw new Error('Stream closed');
			});

			// Should not throw
			expect(() => clearTerminalScreen()).not.toThrow();

			// But should have attempted the write
			expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
		});
	});
});
