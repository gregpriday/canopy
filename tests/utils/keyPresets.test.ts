import { describe, it, expect } from 'vitest';
import {
	STANDARD_PRESET,
	VIM_PRESET,
	getResolvedKeyMap,
} from '../../src/utils/keyPresets.js';
import type { KeyAction } from '../../src/types/keymap.js';

describe('STANDARD_PRESET', () => {
	it('has all required actions defined', () => {
		const requiredActions: KeyAction[] = [
			'nav.up',
			'nav.down',
			'nav.left',
			'nav.right',
			'nav.pageUp',
			'nav.pageDown',
			'nav.home',
			'nav.end',
			'nav.expand',
			'nav.primary',
			'file.copyPath',
			'file.copyTree',
			'ui.refresh',
			'ui.help',
			'ui.contextMenu',
			'ui.command',
			'ui.filter',
			'ui.escape',
			'git.toggle',
			'worktree.next',
			'worktree.panel',
			'app.quit',
			'app.forceQuit',
		];

		requiredActions.forEach((action) => {
			expect(STANDARD_PRESET[action]).toBeDefined();
			expect(Array.isArray(STANDARD_PRESET[action])).toBe(true);
			expect(STANDARD_PRESET[action].length).toBeGreaterThan(0);
		});
	});

	it('uses arrow keys for navigation', () => {
		expect(STANDARD_PRESET['nav.up']).toEqual(['up']);
		expect(STANDARD_PRESET['nav.down']).toEqual(['down']);
		expect(STANDARD_PRESET['nav.left']).toEqual(['left']);
		expect(STANDARD_PRESET['nav.right']).toEqual(['right']);
	});

	it('includes standard keybindings', () => {
		expect(STANDARD_PRESET['ui.command']).toEqual(['/']);
		expect(STANDARD_PRESET['ui.filter']).toEqual(['ctrl+f']);
		expect(STANDARD_PRESET['app.quit']).toEqual(['q']);
		expect(STANDARD_PRESET['ui.help']).toEqual(['?']);
	});
});

describe('VIM_PRESET', () => {
	it('inherits from standard preset', () => {
		// Non-nav keys should be same as standard
		expect(VIM_PRESET['ui.command']).toEqual(STANDARD_PRESET['ui.command']);
		expect(VIM_PRESET['app.quit']).toEqual(STANDARD_PRESET['app.quit']);
		expect(VIM_PRESET['ui.help']).toEqual(STANDARD_PRESET['ui.help']);
	});

	it('uses hjkl for navigation', () => {
		expect(VIM_PRESET['nav.up']).toContain('k');
		expect(VIM_PRESET['nav.down']).toContain('j');
		expect(VIM_PRESET['nav.left']).toContain('h');
		expect(VIM_PRESET['nav.right']).toContain('l');
	});

	it('keeps arrow keys as alternatives', () => {
		expect(VIM_PRESET['nav.up']).toContain('up');
		expect(VIM_PRESET['nav.down']).toContain('down');
		expect(VIM_PRESET['nav.left']).toContain('left');
		expect(VIM_PRESET['nav.right']).toContain('right');
	});

	it('uses vim-style page up/down', () => {
		expect(VIM_PRESET['nav.pageUp']).toEqual(['ctrl+u', 'pageup']);
		expect(VIM_PRESET['nav.pageDown']).toEqual(['ctrl+d', 'pagedown']);
	});

	it('uses vim-style home/end', () => {
		expect(VIM_PRESET['nav.home']).toContain('g');
		expect(VIM_PRESET['nav.home']).toContain('home');
		expect(VIM_PRESET['nav.end']).toContain('G');
		expect(VIM_PRESET['nav.end']).toContain('end');
	});
});

describe('getResolvedKeyMap', () => {
	it('returns standard preset by default', () => {
		const keyMap = getResolvedKeyMap();
		expect(keyMap).toEqual(STANDARD_PRESET);
	});

	it('returns standard preset when explicitly specified', () => {
		const keyMap = getResolvedKeyMap({ preset: 'standard' });
		expect(keyMap).toEqual(STANDARD_PRESET);
	});

	it('returns vim preset when specified', () => {
		const keyMap = getResolvedKeyMap({ preset: 'vim' });
		expect(keyMap).toEqual(VIM_PRESET);
	});

	it('applies overrides to standard preset', () => {
		const keyMap = getResolvedKeyMap({
			overrides: {
				'app.quit': ['q', 'ctrl+q'],
			},
		});

		expect(keyMap['app.quit']).toEqual(['q', 'ctrl+q']);
		// Other keys should remain unchanged
		expect(keyMap['nav.up']).toEqual(STANDARD_PRESET['nav.up']);
	});

	it('applies overrides to vim preset', () => {
		const keyMap = getResolvedKeyMap({
			preset: 'vim',
			overrides: {
				'ui.filter': ['ctrl+s'],
			},
		});

		expect(keyMap['ui.filter']).toEqual(['ctrl+s']);
		// Vim keys should be preserved
		expect(keyMap['nav.up']).toEqual(VIM_PRESET['nav.up']);
	});

	it('overrides can replace entire binding arrays', () => {
		const keyMap = getResolvedKeyMap({
			overrides: {
				'nav.up': ['w'], // Replace completely
			},
		});

		expect(keyMap['nav.up']).toEqual(['w']);
		expect(keyMap['nav.up']).not.toContain('up');
	});

	it('handles multiple overrides', () => {
		const keyMap = getResolvedKeyMap({
			overrides: {
				'app.quit': ['ctrl+q'],
				'ui.filter': ['ctrl+s'],
				'nav.up': ['w'],
			},
		});

		expect(keyMap['app.quit']).toEqual(['ctrl+q']);
		expect(keyMap['ui.filter']).toEqual(['ctrl+s']);
		expect(keyMap['nav.up']).toEqual(['w']);
	});

	it('handles empty config object', () => {
		const keyMap = getResolvedKeyMap({});
		expect(keyMap).toEqual(STANDARD_PRESET);
	});

	it('preserves non-overridden actions when using overrides', () => {
		const keyMap = getResolvedKeyMap({
			overrides: {
				'app.quit': ['ctrl+q'],
			},
		});

		// Overridden action
		expect(keyMap['app.quit']).toEqual(['ctrl+q']);
		// Non-overridden actions should remain from standard preset
		expect(keyMap['nav.up']).toEqual(STANDARD_PRESET['nav.up']);
		expect(keyMap['ui.help']).toEqual(STANDARD_PRESET['ui.help']);
		expect(keyMap['git.toggle']).toEqual(STANDARD_PRESET['git.toggle']);
	});
});
