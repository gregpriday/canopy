import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exitCommand } from '../../src/commands/definitions/exit.js';
import type { CommandServices } from '../../src/commands/types.js';
import * as terminalUtils from '../../src/utils/terminal.js';

describe('exitCommand', () => {
	let mockServices: CommandServices;
	let clearTerminalScreenSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// Spy on clearTerminalScreen
		clearTerminalScreenSpy = vi.spyOn(terminalUtils, 'clearTerminalScreen').mockImplementation(() => {});

		// Create mock services
		mockServices = {
			ui: {
				notify: vi.fn(),
				refresh: vi.fn(),
				exit: vi.fn(),
			},
			system: {
				cwd: '/test/path',
				openExternal: vi.fn(),
				copyToClipboard: vi.fn(),
				exec: vi.fn(),
			},
			state: {
				selectedPath: null,
				fileTree: [],
				expandedPaths: new Set(),
			},
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should notify user before exiting', async () => {
		await exitCommand.execute([], mockServices);

		expect(mockServices.ui.notify).toHaveBeenCalledWith({
			type: 'info',
			message: 'Exiting Canopy...',
		});
	});

	it('should clear terminal screen before calling ui.exit', async () => {
		await exitCommand.execute([], mockServices);

		// Verify clearTerminalScreen was called
		expect(clearTerminalScreenSpy).toHaveBeenCalledTimes(1);

		// Verify ui.exit was called after clearTerminalScreen
		expect(mockServices.ui.exit).toHaveBeenCalledTimes(1);
	});

	it('should call ui.exit to trigger application exit', async () => {
		await exitCommand.execute([], mockServices);

		expect(mockServices.ui.exit).toHaveBeenCalled();
	});

	it('should return success result', async () => {
		const result = await exitCommand.execute([], mockServices);

		expect(result.success).toBe(true);
		expect(result.message).toBe('Exited application.');
	});

	it('should have correct command metadata', () => {
		expect(exitCommand.name).toBe('exit');
		expect(exitCommand.description).toBe('Exits the Canopy application');
		expect(exitCommand.aliases).toEqual(['quit']);
	});

	it('should maintain correct call order: notify → clear → exit', async () => {
		const callOrder: string[] = [];

		mockServices.ui.notify = vi.fn(() => {
			callOrder.push('notify');
		});

		clearTerminalScreenSpy.mockImplementation(() => {
			callOrder.push('clear');
		});

		mockServices.ui.exit = vi.fn(() => {
			callOrder.push('exit');
		});

		await exitCommand.execute([], mockServices);

		expect(callOrder).toEqual(['notify', 'clear', 'exit']);
	});
});
