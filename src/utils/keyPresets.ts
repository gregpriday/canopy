/**
 * Preset keymaps and keymap resolution logic
 */

import type { KeyAction, KeyMapConfig } from '../types/keymap.js';

/**
 * Standard preset - default Canopy keybindings
 */
export const STANDARD_PRESET: Record<KeyAction, string[]> = {
	'nav.up': ['up'],
	'nav.down': ['down'],
	'nav.left': ['left'],
	'nav.right': ['right'],
	'nav.pageUp': ['pageup', 'ctrl+u'],
	'nav.pageDown': ['pagedown', 'ctrl+d'],
	'nav.home': ['home'],
	'nav.end': ['end'],
	'nav.expand': ['space', 'right'],
	'nav.collapse': ['left'],
	'nav.primary': ['return'],
	'file.open': ['return'],
	'file.copyPath': ['c'],
	'file.copyTree': ['C', 'meta+c'],
	'ui.refresh': ['r'],
	'ui.help': ['?'],
	'ui.contextMenu': ['m'],
	'ui.command': ['/'],
	'ui.filter': ['ctrl+f'],
	'ui.escape': ['escape'],
	'git.toggle': ['g'],
	'worktree.next': ['w'],
	'worktree.panel': ['W'],
	'app.quit': ['q'],
	'app.forceQuit': ['ctrl+c'],
};

/**
 * Vim preset - vim-style keybindings with hjkl navigation
 */
export const VIM_PRESET: Record<KeyAction, string[]> = {
	...STANDARD_PRESET,
	'nav.up': ['k', 'up'],
	'nav.down': ['j', 'down'],
	'nav.left': ['h', 'left'],
	'nav.right': ['l', 'right'],
	'nav.pageUp': ['ctrl+u', 'pageup'],
	'nav.pageDown': ['ctrl+d', 'pagedown'],
	'nav.home': ['g', 'home'], // Note: multi-key 'gg' would be future enhancement
	'nav.end': ['G', 'end'],
};

/**
 * Resolves final keymap from preset + overrides
 *
 * @param config - Keymap configuration (preset and overrides)
 * @returns Fully resolved keymap with all actions mapped to key strings
 *
 * @example
 * const keyMap = getResolvedKeyMap({ preset: 'vim' });
 * // Returns vim preset with hjkl navigation
 *
 * @example
 * const keyMap = getResolvedKeyMap({
 *   preset: 'standard',
 *   overrides: { 'app.quit': ['q', 'ctrl+q'] }
 * });
 * // Returns standard preset with custom quit bindings
 */
export function getResolvedKeyMap(
	config?: KeyMapConfig,
): Record<KeyAction, string[]> {
	const preset = config?.preset === 'vim' ? VIM_PRESET : STANDARD_PRESET;

	if (!config?.overrides) return preset;

	// Merge overrides into preset
	return {
		...preset,
		...config.overrides,
	};
}
