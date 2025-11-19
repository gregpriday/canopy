import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import path from 'path';
import { execa } from 'execa';
import fs from 'fs-extra';
import type { YellowwoodConfig, OpenerConfig } from '../types/index.js';
import { openFile } from '../utils/fileOpener.js';
import { copyFilePath } from '../utils/clipboard.js';

interface ContextMenuProps {
	path: string;
	rootPath: string;
	position: { x: number; y: number };
	config: YellowwoodConfig;
	onClose: () => void;
	onAction: (actionType: string, result: ActionResult) => void;
}

interface ActionResult {
	success: boolean;
	message: string;
}

interface MenuItem {
	label: string;
	value: string;
	disabled?: boolean;
}

type MenuState = 'main' | 'open-with';

/**
 * Context menu component for file operations.
 * Triggered by right-click or 'm' key.
 *
 * Actions:
 * - Open: Open with default editor
 * - Open with...: Choose from available openers
 * - Copy absolute path: Copy full path to clipboard
 * - Copy relative path: Copy path relative to project root
 * - Reveal in file manager: Open parent folder with file selected
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
	path: filePath,
	rootPath,
	position,
	config,
	onClose,
	onAction,
}) => {
	const [menuState, setMenuState] = useState<MenuState>('main');
	const [isExecuting, setIsExecuting] = useState(false);

	// Check if path is a file or directory
	const isDirectory = useMemo(() => {
		try {
			return fs.statSync(filePath).isDirectory();
		} catch {
			return false;
		}
	}, [filePath]);

	// Get available openers for "Open with..." submenu
	const { availableOpeners, openerMap } = useMemo(() => {
		const openers: MenuItem[] = [];
		const map = new Map<string, OpenerConfig>();
		const openersConfig = config.openers;
		if (!openersConfig) {
			return {
				availableOpeners: openers,
				openerMap: map,
			};
		}

		// Add default opener
		openers.push({
			label: `${openersConfig.default.cmd} (default)`,
			value: 'default',
		});
		map.set('default', openersConfig.default);

		// Add extension-based openers
		const ext = path.extname(filePath);
		const extensionOpeners = openersConfig.byExtension ?? {};
		if (ext) {
			const extensionOpener = extensionOpeners[ext];
			if (extensionOpener) {
				openers.push({
					label: `${extensionOpener.cmd} (for ${ext})`,
					value: `ext:${ext}`,
				});
				map.set(`ext:${ext}`, extensionOpener);
			}
		}

		// Add glob-based openers that match this file
		const globOpeners = openersConfig.byGlob ?? {};
		for (const [pattern, opener] of Object.entries(globOpeners)) {
			// Simple pattern matching (could use minimatch for accuracy)
			if (filePath.includes(pattern.replace('**/', '').replace('/*', ''))) {
				const value = `glob:${pattern}`;
				openers.push({
					label: `${opener.cmd} (for ${pattern})`,
					value,
				});
				map.set(value, opener);
			}
		}

		// Add "Back" option
		openers.push({
			label: '� Back',
			value: 'back',
		});

		return {
			availableOpeners: openers,
			openerMap: map,
		};
	}, [filePath, config.openers]);

	// Main menu items
	const mainMenuItems: MenuItem[] = useMemo(() => {
		const items: MenuItem[] = [];

		if (!isDirectory) {
			items.push({ label: 'Open', value: 'open' });
			items.push({ label: 'Open with...', value: 'open-with' });
		}

		items.push({ label: 'Copy absolute path', value: 'copy-absolute' });
		items.push({ label: 'Copy relative path', value: 'copy-relative' });
		items.push({ label: 'Reveal in file manager', value: 'reveal' });

		return items;
	}, [isDirectory]);

	// Handle ESC key to close menu
	useInput((input, key) => {
		if (key.escape && !isExecuting) {
			onClose();
		}
	});

		// Execute menu action
		const handleSelect = async (item: MenuItem) => {
			if (isExecuting) return;

			const action = item.value;

			// Handle submenu navigation
			if (action === 'open-with') {
				setMenuState('open-with');
				return;
			}

			if (action === 'back') {
				setMenuState('main');
				return;
			}

			// Execute file operation
			setIsExecuting(true);

			try {
				let result: ActionResult;

				const opener = openerMap.get(action);
				if (opener) {
					await openFile(filePath, config, opener);
					result = {
						success: true,
						message: `Opened ${path.basename(filePath)}`,
					};
				} else {
					switch (action) {
						case 'open':
							await openFile(filePath, config);
							result = {
								success: true,
								message: `Opened ${path.basename(filePath)}`,
							};
							break;

						case 'copy-absolute':
							await copyFilePath(filePath, rootPath, false);
							result = {
								success: true,
								message: 'Absolute path copied to clipboard',
							};
							break;

						case 'copy-relative':
							await copyFilePath(filePath, rootPath, true);
							result = {
								success: true,
								message: 'Relative path copied to clipboard',
							};
							break;

						case 'reveal':
							await revealInFileManager(filePath);
							result = {
								success: true,
								message: 'Revealed in file manager',
							};
							break;

						// Handle fallback when "Open with..." items have no opener metadata
						default:
							if (
								action.startsWith('ext:') ||
								action.startsWith('glob:') ||
								action === 'default'
							) {
								await openFile(filePath, config);
								result = {
									success: true,
									message: `Opened ${path.basename(filePath)}`,
								};
							} else {
								result = {
									success: false,
									message: 'Unknown action',
								};
							}
					}
				}

				onAction(action, result);
				onClose();
		} catch (error) {
			onAction(action, {
				success: false,
				message: (error as Error).message,
			});
			onClose();
		} finally {
			setIsExecuting(false);
		}
	};

	// Determine current menu items
	const currentItems = menuState === 'main' ? mainMenuItems : availableOpeners;

	return (
		<Box
			borderStyle="round"
			borderColor="cyan"
			paddingX={1}
			flexDirection="column"
		>
			{isExecuting ? (
				<Text color="gray">Executing...</Text>
			) : (
				<SelectInput items={currentItems} onSelect={handleSelect} />
			)}
		</Box>
	);
};

/**
 * Open the parent directory of a file in the system file manager,
 * with the file selected if possible.
 *
 * @param filePath - Path to file to reveal
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
		throw new Error(`Failed to reveal in file manager: ${(error as Error).message}`);
	}
}
