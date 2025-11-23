import React from 'react';
import { render } from 'ink-testing-library';
import { ThemeProvider } from '../src/theme/ThemeProvider.js';
import { WorktreeOverview } from '../src/components/WorktreeOverview.js';
import { mockWorktrees, mockWorktreeChanges } from '../tests/fixtures/mockWorktrees.js';

const { lastFrame } = render(
  <ThemeProvider mode="default">
    <WorktreeOverview
      worktrees={mockWorktrees}
      worktreeChanges={mockWorktreeChanges}
      activeWorktreeId={mockWorktrees[0].id}
      focusedWorktreeId={mockWorktrees[0].id}
      expandedWorktreeIds={new Set()}
      onToggleExpand={() => undefined}
      onCopyTree={() => undefined}
      onOpenEditor={() => undefined}
    />
  </ThemeProvider>
);

console.log(lastFrame());
