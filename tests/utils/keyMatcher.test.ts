import { describe, it, expect } from 'vitest';
import { matchesKey, isAction } from '../../src/utils/keyMatcher.js';
import type { Key } from 'ink';
import type { KeyAction } from '../../src/types/keymap.js';

describe('matchesKey', () => {
	describe('special keys', () => {
		it('matches arrow keys', () => {
			expect(matchesKey('', { upArrow: true } as Key, 'up')).toBe(true);
			expect(matchesKey('', { downArrow: true } as Key, 'down')).toBe(true);
			expect(matchesKey('', { leftArrow: true } as Key, 'left')).toBe(true);
			expect(matchesKey('', { rightArrow: true } as Key, 'right')).toBe(true);
		});

		it('matches return/enter', () => {
			expect(matchesKey('', { return: true } as Key, 'return')).toBe(true);
			expect(matchesKey('', { return: true } as Key, 'enter')).toBe(true);
		});

		it('matches escape', () => {
			expect(matchesKey('', { escape: true } as Key, 'escape')).toBe(true);
			expect(matchesKey('', { escape: true } as Key, 'esc')).toBe(true);
		});

		it('matches page up/down', () => {
			expect(matchesKey('', { pageUp: true } as Key, 'pageup')).toBe(true);
			expect(matchesKey('', { pageDown: true } as Key, 'pagedown')).toBe(true);
		});

		it('matches space', () => {
			expect(matchesKey(' ', {} as Key, 'space')).toBe(true);
			expect(matchesKey('x', {} as Key, 'space')).toBe(false);
		});

		it('matches tab', () => {
			expect(matchesKey('', { tab: true } as Key, 'tab')).toBe(true);
		});
	});

	describe('modifiers', () => {
		it('matches ctrl modifier', () => {
			expect(matchesKey('f', { ctrl: true } as Key, 'ctrl+f')).toBe(true);
			expect(matchesKey('f', {} as Key, 'ctrl+f')).toBe(false);
		});

		it('matches shift modifier', () => {
			expect(matchesKey('G', { shift: true } as Key, 'shift+g')).toBe(true);
			expect(matchesKey('g', {} as Key, 'shift+g')).toBe(false);
		});

		it('matches meta modifier', () => {
			expect(matchesKey('c', { meta: true } as Key, 'meta+c')).toBe(true);
			expect(matchesKey('c', {} as Key, 'meta+c')).toBe(false);
		});

		it('matches multiple modifiers', () => {
			expect(
				matchesKey('f', { ctrl: true, shift: true } as Key, 'ctrl+shift+f'),
			).toBe(true);
			expect(matchesKey('f', { ctrl: true } as Key, 'ctrl+shift+f')).toBe(
				false,
			);
		});

		it('matches meta with shift modifier', () => {
			expect(
				matchesKey('F', { shift: true, meta: true } as Key, 'meta+shift+f'),
			).toBe(true);
			expect(matchesKey('F', { meta: true } as Key, 'meta+shift+f')).toBe(
				false,
			);
		});

		it('requires exact modifier match', () => {
			expect(matchesKey('f', { ctrl: true } as Key, 'f')).toBe(false);
			expect(matchesKey('f', {} as Key, 'ctrl+f')).toBe(false);
		});

		it('allows naturally shifted characters without explicit shift modifier', () => {
			// These are critical for '?', 'G', 'W', 'C' keybindings
			// Configs now use uppercase to properly match shifted chars
			expect(matchesKey('?', { shift: true } as Key, '?')).toBe(true);
			expect(matchesKey('G', { shift: true } as Key, 'G')).toBe(true);
			expect(matchesKey('W', { shift: true } as Key, 'W')).toBe(true);
			expect(matchesKey('C', { shift: true } as Key, 'C')).toBe(true);
		});

		it('rejects special keys when flag not set', () => {
			expect(matchesKey('', {} as Key, 'tab')).toBe(false);
			expect(matchesKey('', { tab: false } as Key, 'tab')).toBe(false);
		});
	});

	describe('literal characters', () => {
		it('matches single characters', () => {
			expect(matchesKey('j', {} as Key, 'j')).toBe(true);
			expect(matchesKey('k', {} as Key, 'k')).toBe(true);
			expect(matchesKey('?', {} as Key, '?')).toBe(true);
		});

		it('is case-sensitive for character matching', () => {
			expect(matchesKey('G', {} as Key, 'G')).toBe(true);
			expect(matchesKey('g', {} as Key, 'g')).toBe(true);
			expect(matchesKey('G', {} as Key, 'g')).toBe(false);
			expect(matchesKey('g', {} as Key, 'G')).toBe(false);
		});

		it('does not match wrong character', () => {
			expect(matchesKey('j', {} as Key, 'k')).toBe(false);
		});
	});

	describe('case sensitivity', () => {
		it('handles uppercase config strings', () => {
			expect(matchesKey('G', {} as Key, 'G')).toBe(true);
		});

		it('handles lowercase config strings', () => {
			expect(matchesKey('g', {} as Key, 'g')).toBe(true);
		});

		it('distinguishes between uppercase and lowercase', () => {
			expect(matchesKey('W', {} as Key, 'w')).toBe(false);
			expect(matchesKey('w', {} as Key, 'W')).toBe(false);
		});
	});
});

describe('isAction', () => {
	it('matches when any binding matches', () => {
		const keyMap: Record<KeyAction, string[]> = {
			'nav.up': ['k', 'up'],
		} as Record<KeyAction, string[]>;

		expect(isAction('k', {} as Key, 'nav.up', keyMap)).toBe(true);
		expect(isAction('', { upArrow: true } as Key, 'nav.up', keyMap)).toBe(
			true,
		);
	});

	it('returns false when no bindings match', () => {
		const keyMap: Record<KeyAction, string[]> = {
			'nav.up': ['k', 'up'],
		} as Record<KeyAction, string[]>;

		expect(isAction('j', {} as Key, 'nav.up', keyMap)).toBe(false);
		expect(isAction('', { downArrow: true } as Key, 'nav.up', keyMap)).toBe(
			false,
		);
	});

	it('handles empty binding arrays', () => {
		const keyMap: Record<KeyAction, string[]> = {
			'nav.up': [],
		} as Record<KeyAction, string[]>;

		expect(isAction('k', {} as Key, 'nav.up', keyMap)).toBe(false);
	});

	it('handles missing action in keymap', () => {
		const keyMap = {} as Record<KeyAction, string[]>;

		expect(isAction('k', {} as Key, 'nav.up', keyMap)).toBe(false);
	});

	it('matches with modifiers', () => {
		const keyMap: Record<KeyAction, string[]> = {
			'ui.filter': ['ctrl+f'],
		} as Record<KeyAction, string[]>;

		expect(isAction('f', { ctrl: true } as Key, 'ui.filter', keyMap)).toBe(
			true,
		);
		expect(isAction('f', {} as Key, 'ui.filter', keyMap)).toBe(false);
	});
});
