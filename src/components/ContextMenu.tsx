import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import fs from 'fs-extra';
import type { CanopyConfig, SystemServices } from '../types/index.js';
import type { ContextMenuItem } from '../types/contextMenu.js';
import {
	getDefaultFileActions,
	getDefaultFolderActions,
	mergeContextMenuItems,
} from '../utils/contextMenuActions.js';

interface ContextMenuProps {
	path: string;
	position: { x: number; y: number };
	config: CanopyConfig;
	services: SystemServices;
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

/**
 * Context menu component for file and folder operations.
 * Triggered by right-click or 'm' key.
 *
 * Features:
 * - File-specific actions: Open, Open with..., Copy paths
 * - Folder-specific actions: Run CopyTree, Open Terminal, Reveal in file manager
 * - Configurable custom actions via config.contextMenu
 * - Stack-based submenu navigation
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
	path: filePath,
	position,
	config,
	services,
	onClose,
	onAction,
}) => {
	// Stack-based menu navigation for submenus
	const [menuStack, setMenuStack] = useState<ContextMenuItem[][]>([]);
	const [isExecuting, setIsExecuting] = useState(false);

	// Check if path is a file or directory
	const isDirectory = useMemo(() => {
		try {
			return fs.statSync(filePath).isDirectory();
		} catch {
			return false;
		}
	}, [filePath]);

	// Build root menu items based on type
	const rootMenuItems = useMemo(() => {
		const fileActions = getDefaultFileActions(config, filePath);
		const folderActions = isDirectory ? getDefaultFolderActions() : [];

		// Combine folder actions first, then file actions
		const allDefaults = [...folderActions, ...fileActions];

		// Filter by scope
		const scopedItems = allDefaults.filter(
			(item) =>
				item.scope === 'both' ||
				(isDirectory ? item.scope === 'folder' : item.scope === 'file')
		);

		// Merge with custom items from config
		return mergeContextMenuItems(
			scopedItems,
			config.contextMenu?.items,
			config.contextMenu?.disableDefaults
		);
	}, [isDirectory, config, filePath]);

	// Initialize menu stack on first render
	useMemo(() => {
		if (menuStack.length === 0) {
			setMenuStack([rootMenuItems]);
		}
	}, [rootMenuItems, menuStack.length]);

	// Get current menu level
	const currentMenuItems = menuStack.length > 0
		? menuStack[menuStack.length - 1]
		: rootMenuItems;

	// Handle ESC key to close menu or go back in submenu
	useInput((input, key) => {
		if (key.escape && !isExecuting) {
			if (menuStack.length > 1) {
				// Go back in submenu stack
				setMenuStack((prev) => prev.slice(0, -1));
			} else {
				// Close menu entirely
				onClose();
			}
		}
	});

	// Execute menu action
	const handleSelect = async (item: MenuItem) => {
		if (isExecuting) return;

		// Find the actual menu item
		const menuItem = currentMenuItems.find((mi) => mi.id === item.value);
		if (!menuItem) return;

		// Handle "Back" navigation
		if (menuItem.id === 'back') {
			setMenuStack((prev) => prev.slice(0, -1));
			return;
		}

		// Handle submenu navigation
		if (menuItem.type === 'submenu') {
			setMenuStack((prev) => [...prev, menuItem.items]);
			return;
		}

		// Execute the action
		setIsExecuting(true);

		try {
			let result: ActionResult;

			if (menuItem.type === 'action') {
				await menuItem.execute(filePath, services);
				result = {
					success: true,
					message: `Executed ${menuItem.label}`,
				};
			} else {
				result = {
					success: false,
					message: 'Unknown menu item type',
				};
			}

			onAction(menuItem.id, result);
			onClose();
		} catch (error) {
			onAction(menuItem.id, {
				success: false,
				message: (error as Error).message,
			});
			onClose();
		} finally {
			setIsExecuting(false);
		}
	};

	// Convert current menu items to SelectInput format
	const selectItems: MenuItem[] = currentMenuItems
		.filter((item): item is Exclude<ContextMenuItem, { type: 'separator' }> => item.type !== 'separator')
		.map((item) => {
			const icon = 'icon' in item && item.icon ? `${item.icon} ` : '';
			const shortcut = 'shortcut' in item && item.shortcut ? ` (${item.shortcut})` : '';
			const label = 'label' in item ? item.label : '';

			return {
				label: `${icon}${label}${shortcut}`,
				value: item.id,
			};
		});

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
				<SelectInput items={selectItems} onSelect={handleSelect} />
			)}
		</Box>
	);
};
