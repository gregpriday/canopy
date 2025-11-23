import React from 'react';
import { Text } from 'ink';
import type { GitStatus } from '../types/index.js';

/**
 * Color-coded circle glyph for git status
 * Uses Unicode circle: ● (U+25CF)
 */
export function GitIndicator({ status }: { status: GitStatus }): React.JSX.Element {
	const config = {
		modified: { color: '#FFD700', glyph: '●' }, // Gold
		added: { color: '#00FA9A', glyph: '●' }, // Medium Spring Green
		deleted: { color: '#FF6347', glyph: '●' }, // Tomato
		renamed: { color: '#00BFFF', glyph: '●' }, // Deep Sky Blue for rename/move
		untracked: { color: '#A9A9A9', glyph: '○' }, // Hollow circle for untracked
		ignored: { color: '#696969', glyph: '·' }, // Dim dot for ignored
	};

	const { color, glyph } = config[status];

	return <Text color={color}>{glyph}</Text>;
}

/**
 * Backward compatible: return single character for text-based rendering
 */
export function getGitStatusGlyph(status: GitStatus): string {
	const glyphs: Record<GitStatus, string> = {
		modified: '●',
		added: '●',
		deleted: '●',
		renamed: '●',
		untracked: '○',
		ignored: '·',
	};
	return glyphs[status];
}
