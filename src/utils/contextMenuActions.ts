import path from 'path';
import { execa } from 'execa';
import { copyFilePath, copyToClipboard } from './clipboard.js';
import { openFile } from './fileOpener.js';
import type { ContextMenuItem } from '../types/contextMenu.js';
import type { CanopyConfig } from '../types/index.js';

/**
 * Get platform-specific label for the "Reveal in file manager" action.
 */
function getPlatformRevealLabel(): string {
	const platform = process.platform;
	if (platform === 'darwin') return 'Reveal in Finder';
	if (platform === 'win32') return 'Reveal in Explorer';
	return 'Reveal in File Manager';
}

/**
 * Get platform-specific label for the "Open Terminal Here" action.
 */
function getPlatformTerminalLabel(): string {
	const platform = process.platform;
	if (platform === 'darwin') return 'Open Terminal Here';
	if (platform === 'win32') return 'Open Command Prompt Here';
	return 'Open Terminal Here';
}

/**
 * Open the parent directory of a file in the system file manager,
 * with the file selected if possible.
 */
async function revealInFileManager(filePath: string): Promise<void> {
	const platform = process.platform;

	try {
		if (platform === 'darwin') {
			// macOS: Use 'open -R' to reveal in Finder with file selected
			await execa('open', ['-R', filePath]);
		} else if (platform === 'win32') {
			// Windows: Use 'explorer /select' to open Explorer with file selected
			await execa('explorer', ['/select,', filePath]);
		} else {
			// Linux/Unix: Open parent directory (can't select file in most file managers)
			const parentDir = path.dirname(filePath);
			await execa('xdg-open', [parentDir]);
		}
	} catch (error) {
		throw new Error(
			`Failed to reveal in file manager: ${(error as Error).message}`
		);
	}
}

/**
 * Open a terminal in the specified directory.
 */
async function openTerminalHere(dirPath: string): Promise<void> {
	const platform = process.platform;

	try {
		if (platform === 'darwin') {
			// macOS: Open Terminal.app with the directory
			await execa('open', ['-a', 'Terminal', dirPath]);
		} else if (platform === 'win32') {
			// Windows: Open cmd.exe in the directory
			await execa('cmd', ['/c', 'start', 'cmd.exe', '/K', `cd /d "${dirPath}"`]);
		} else {
			// Linux/Unix: Try to open default terminal (varies by distro)
			// Common terminals: gnome-terminal, xterm, konsole
			try {
				await execa('gnome-terminal', ['--working-directory', dirPath]);
			} catch {
				try {
					await execa('xterm', ['-e', `cd "${dirPath}" && bash`]);
				} catch {
					// Fallback: just open file manager
					await execa('xdg-open', [dirPath]);
				}
			}
		}
	} catch (error) {
		throw new Error(`Failed to open terminal: ${(error as Error).message}`);
	}
}

/**
 * Build "Open with..." submenu items based on configured openers.
 */
function buildOpenWithSubmenu(
	config: CanopyConfig,
	filePath: string
): ContextMenuItem[] {
	const items: ContextMenuItem[] = [];
	const openers = config.openers;

	if (!openers) {
		return items;
	}

	// Add default opener
	items.push({
		type: 'action',
		id: 'open-default',
		label: `${openers.default.cmd} (default)`,
		scope: 'file',
		execute: async (path, services) => {
			await openFile(path, config, openers.default);
		},
	});

	// Add extension-based openers
	const ext = path.extname(filePath);
	if (ext && openers.byExtension?.[ext]) {
		const extensionOpener = openers.byExtension[ext];
		items.push({
			type: 'action',
			id: `open-ext-${ext}`,
			label: `${extensionOpener.cmd} (for ${ext})`,
			scope: 'file',
			execute: async (path, services) => {
				await openFile(path, config, extensionOpener);
			},
		});
	}

	// Add glob-based openers that match this file
	if (openers.byGlob) {
		for (const [pattern, opener] of Object.entries(openers.byGlob)) {
			// Simple pattern matching (could use minimatch for better accuracy)
			const simplifiedPattern = pattern.replace('**/', '').replace('/*', '');
			if (filePath.includes(simplifiedPattern)) {
				items.push({
					type: 'action',
					id: `open-glob-${pattern}`,
					label: `${opener.cmd} (for ${pattern})`,
					scope: 'file',
					execute: async (path, services) => {
						await openFile(path, config, opener);
					},
				});
			}
		}
	}

	// Add "Back" option
	items.push({
		type: 'action',
		id: 'back',
		label: '← Back',
		scope: 'file',
		execute: async () => {
			// Handled by ContextMenu component (navigate back in stack)
		},
	});

	return items;
}

/**
 * Get default context menu items for files.
 * These are the standard file operations.
 */
export function getDefaultFileActions(
	config: CanopyConfig,
	filePath: string
): ContextMenuItem[] {
	return [
		{
			type: 'action',
			id: 'open',
			label: 'Open',
			scope: 'file',
			icon: '📂',
			execute: async (path, services) => {
				await openFile(path, config);
			},
		},
		{
			type: 'submenu',
			id: 'open-with',
			label: 'Open with...',
			scope: 'file',
			icon: '⚙️',
			items: buildOpenWithSubmenu(config, filePath),
		},
		{
			type: 'separator',
			id: 'sep-1',
			scope: 'both',
		},
		{
			type: 'action',
			id: 'copy-filename',
			label: 'Copy filename',
			scope: 'both',
			icon: '📋',
			execute: async (filePath, services) => {
				const filename = path.basename(filePath);
				await copyToClipboard(filename);
			},
		},
		{
			type: 'action',
			id: 'copy-relative',
			label: 'Copy relative path',
			scope: 'both',
			icon: '📋',
			shortcut: 'c',
			execute: async (filePath, services) => {
				await copyFilePath(filePath, services.system.cwd, true);
			},
		},
		{
			type: 'action',
			id: 'copy-absolute',
			label: 'Copy absolute path',
			scope: 'both',
			icon: '📋',
			execute: async (filePath, services) => {
				await copyFilePath(filePath, services.system.cwd, false);
			},
		},
		{
			type: 'separator',
			id: 'sep-2',
			scope: 'both',
		},
		{
			type: 'action',
			id: 'reveal',
			label: getPlatformRevealLabel(),
			scope: 'both',
			icon: '👁️',
			execute: async (filePath) => {
				await revealInFileManager(filePath);
			},
		},
	];
}

/**
 * Get default context menu items for folders.
 * These are folder-specific operations.
 */
export function getDefaultFolderActions(): ContextMenuItem[] {
	return [
		{
			type: 'command',
			id: 'copytree',
			label: 'Run CopyTree',
			scope: 'folder',
			icon: '🌲',
			commandName: 'copytree',
			args: [],
		},
		{
			type: 'action',
			id: 'open-terminal',
			label: getPlatformTerminalLabel(),
			scope: 'folder',
			icon: '💻',
			execute: async (dirPath, services) => {
				await openTerminalHere(dirPath);
			},
		},
		{
			type: 'separator',
			id: 'sep-folder',
			scope: 'folder',
		},
	];
}

/**
 * Merge default actions with user-configured custom actions.
 * Filters out disabled default items.
 */
export function mergeContextMenuItems(
	defaults: ContextMenuItem[],
	customItems: ContextMenuItem[] = [],
	disabledIds: string[] = []
): ContextMenuItem[] {
	// Filter out disabled default items
	const enabledDefaults = defaults.filter(
		(item) => !disabledIds.includes(item.id)
	);

	// Append custom items
	return [...enabledDefaults, ...customItems];
}
