import React, { useState } from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { useDashboardNav } from '../../src/hooks/useDashboardNav.js';
import type { Worktree } from '../../src/types/index.js';

const worktrees: Worktree[] = [
  { id: 'main', path: '/repo/main', name: 'main', branch: 'main', isCurrent: true, mood: 'stable' },
  { id: 'feat', path: '/repo/feat', name: 'feat', branch: 'feat', isCurrent: false, mood: 'active' },
  { id: 'bug', path: '/repo/bug', name: 'bug', branch: 'bug', isCurrent: false, mood: 'stale' },
];

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function Harness({
  isModalOpen = false,
  viewportSize = 2,
  spies,
}: {
  isModalOpen?: boolean;
  viewportSize?: number;
  spies: {
    onFocusChange: ReturnType<typeof vi.fn>;
    onCopyTree: ReturnType<typeof vi.fn>;
    onOpenEditor: ReturnType<typeof vi.fn>;
  };
}) {
  const [focused, setFocused] = useState<string | null>(worktrees[0].id);

  const nav = useDashboardNav({
    worktrees,
    focusedWorktreeId: focused,
    isModalOpen,
    viewportSize,
    onFocusChange: (id) => {
      spies.onFocusChange(id);
      setFocused(id);
    },
    onCopyTree: spies.onCopyTree,
    onOpenEditor: spies.onOpenEditor,
  });

  return (
    <Text>
      focus:{focused} window:{nav.visibleStart}-{nav.visibleEnd}
    </Text>
  );
}

describe('useDashboardNav', () => {
  const makeSpies = () => ({
    onFocusChange: vi.fn(),
    onCopyTree: vi.fn(),
    onOpenEditor: vi.fn(),
  });

  it('moves focus with arrow keys within bounds', async () => {
    const spies = makeSpies();
    const { stdin, lastFrame } = render(<Harness spies={spies} />);
    await tick();

    stdin.write('\x1B[B'); // down
    await tick();
    await tick();
    expect(spies.onFocusChange).toHaveBeenLastCalledWith('feat');
    expect(lastFrame()).toContain('focus:feat');

    stdin.write('\x1B[A'); // up
    await tick();
    await tick();
    expect(spies.onFocusChange).toHaveBeenLastCalledWith('main');
    expect(lastFrame()).toContain('focus:main');
  });

  it('guards navigation when a modal is open', async () => {
    const spies = makeSpies();
    const { stdin, lastFrame } = render(<Harness spies={spies} isModalOpen />);
    await tick();

    stdin.write('\x1B[B');
    await tick();

    expect(spies.onFocusChange).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('focus:main');
  });

  it('fires action keys for copy and open editor', async () => {
    const spies = makeSpies();
    const { stdin } = render(<Harness spies={spies} />);
    await tick();

    stdin.write('c');
    stdin.write('\r');
    await tick();

    expect(spies.onCopyTree).toHaveBeenCalledWith('main');
    expect(spies.onOpenEditor).toHaveBeenCalledWith('main');
  });

  it('adjusts visible window when focus moves past viewport', async () => {
    const spies = makeSpies();
    const { stdin, lastFrame } = render(<Harness spies={spies} viewportSize={2} />);
    await tick();

    stdin.write('\x1B[B');
    await tick();
    await tick();
    stdin.write('\x1B[B'); // move to index 2
    await tick();
    await tick();

    expect(spies.onFocusChange).toHaveBeenLastCalledWith('bug');
    expect(lastFrame()).toContain('window:1-3');
  });
});
