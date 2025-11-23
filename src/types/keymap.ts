/**
 * Keymap types for configurable keyboard shortcuts
 */

/**
 * Semantic actions that can be triggered by keyboard shortcuts
 */
export type KeyAction =
	// Navigation
	| 'nav.up'
	| 'nav.down'
	| 'nav.left'
	| 'nav.right'
	| 'nav.pageUp'
	| 'nav.pageDown'
	| 'nav.home'
	| 'nav.end'
	| 'nav.expand'
	| 'nav.collapse'
	| 'nav.primary'

	// File operations
	| 'file.open'
	| 'file.copyPath'
	| 'file.copyTree'

	// UI actions
	| 'ui.refresh'
	| 'ui.help'
	| 'ui.contextMenu'
	| 'ui.command'
	| 'ui.filter'
	| 'ui.escape'

	// Git/Worktree
	| 'git.toggle'
	| 'worktree.next'
	| 'worktree.panel'

	// System
	| 'app.quit'
	| 'app.forceQuit';

/**
 * Configuration for keyboard shortcuts
 */
export interface KeyMapConfig {
	/**
	 * Preset keymap to use as a base
	 * - 'standard': Default keybindings (arrow keys, etc.)
	 * - 'vim': Vim-style keybindings (hjkl navigation, etc.)
	 */
	preset?: 'standard' | 'vim';

	/**
	 * Override specific key bindings
	 * Maps actions to arrays of key strings (e.g., ["j", "down"])
	 */
	overrides?: Partial<Record<KeyAction, string[]>>;
}
