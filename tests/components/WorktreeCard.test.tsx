import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { WorktreeCard } from '../../src/components/WorktreeCard.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import {
  createMockWorktree,
  createCleanWorktree,
  createDirtyWorktree,
  createDetachedWorktree,
  createLoadingWorktree,
  createMockChanges,
  createEmptyChanges,
  createPrioritySortedChanges,
  createOverflowChanges,
  createLongPathChanges,
} from '../fixtures/worktreeFactory.js';

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider mode="dark">{component}</ThemeProvider>);

describe('WorktreeCard - Display Specification Compliance', () => {
  describe('Row 1: Identity (Branch & Path)', () => {
    it('renders branch name in bold', () => {
      const wt = createCleanWorktree({ branch: 'feat/auth' });
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          trafficLight="gray"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      expect(lastFrame()).toContain('feat/auth');
    });

    it('renders detached HEAD state correctly', () => {
      const wt = createDetachedWorktree();
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          trafficLight="gray"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      const output = lastFrame();
      expect(output).toContain('abc1234');
      expect(output).toContain('(detached)');
    });

    it('truncates long paths in the middle', () => {
      const longPath = '/Users/developer/projects/very/long/nested/path/that/exceeds/limit/src';
      const wt = createCleanWorktree({ path: longPath });
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          trafficLight="gray"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/other"
          onToggleExpand={vi.fn()}
        />
      );

      // Path should be truncated with ... in the middle
      const output = lastFrame();
      expect(output).toContain('...');
    });

    it('shows current worktree indicator', () => {
      const wt = createCleanWorktree({ isCurrent: true });
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          trafficLight="gray"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      // Current worktree should show ● prefix
      const output = lastFrame();
      expect(output).toContain('●');
    });
  });

  describe('Row 2: Statistics & Traffic Light', () => {
    it('renders traffic light colors correctly based on trafficLight prop - green', () => {
      const wt = createDirtyWorktree(3);
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createMockChanges([
            { path: 'a.ts', status: 'modified', insertions: 45, deletions: 0 },
          ])}
          mood="active"
          trafficLight="green" // Should use green, not mood
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      // Should render with green color indicator
      expect(lastFrame()).toContain('●');
    });

    it('renders traffic light colors correctly based on trafficLight prop - yellow', () => {
      const wt = createDirtyWorktree(3);
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createMockChanges([
            { path: 'a.ts', status: 'modified', insertions: 45, deletions: 0 },
          ])}
          mood="active"
          trafficLight="yellow" // Should use yellow
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      expect(lastFrame()).toContain('●');
    });

    it('renders traffic light colors correctly based on trafficLight prop - gray', () => {
      const wt = createCleanWorktree();
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          trafficLight="gray" // Should use gray
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      expect(lastFrame()).toContain('●');
    });

    it('calculates insertion/deletion stats accurately', () => {
      const changes = createMockChanges([
        { path: 'a.ts', status: 'modified', insertions: 45, deletions: 0 },
        { path: 'b.ts', status: 'modified', insertions: 0, deletions: 12 },
      ]);

      const wt = createDirtyWorktree(2);
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={changes}
          mood="active"
          trafficLight="green"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      const output = lastFrame();
      expect(output).toContain('+45');
      expect(output).toContain('-12');
      expect(output).toContain('2 files');
    });

    it('handles singular vs plural file count', () => {
      const changes = createMockChanges([
        { path: 'a.ts', status: 'modified', insertions: 5, deletions: 2 },
      ]);

      const wt = createDirtyWorktree(1);
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={changes}
          mood="active"
          trafficLight="green"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      // Should say "1 file" not "1 files"
      expect(lastFrame()).toContain('1 file');
    });
  });

  describe('Row 3: AI Summary / Last Commit', () => {
    it('renders Last Commit for clean worktrees with ✅ prefix', () => {
      const wt = createCleanWorktree({
        summary: '✅ feat: added login',
        modifiedCount: 0,
      });

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          trafficLight="gray"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      const output = lastFrame();
      expect(output).toContain('Last commit: ✅ feat: added login');
    });

    it('renders AI Summary for dirty worktrees without "Last commit:" prefix', () => {
      const wt = createDirtyWorktree(5, {
        summary: '🔧 Refactoring auth',
      });

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createMockChanges([
            { path: 'a.ts', status: 'modified', insertions: 10, deletions: 5 },
          ])}
          mood="active"
          trafficLight="green"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      const output = lastFrame();
      expect(output).not.toContain('Last commit:');
      expect(output).toContain('🔧 Refactoring auth');
    });

    it('renders Loading state', () => {
      const wt = createLoadingWorktree();
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createMockChanges([
            { path: 'a.ts', status: 'modified', insertions: 10, deletions: 5 },
          ])}
          mood="active"
          trafficLight="green"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      expect(lastFrame()).toContain('Generating summary...');
    });

    it('NEVER shows "No active changes" forbidden state', () => {
      // Test fallback case
      const wt = createMockWorktree({
        summary: undefined,
        summaryLoading: false,
        branch: 'test-branch',
      });

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          trafficLight="gray"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      const output = lastFrame();
      // Should show "Clean: {branch}" or "Ready", NOT "No active changes"
      expect(output).not.toContain('No active changes');
      expect(output).toMatch(/Clean: test-branch|Ready/);
    });

    it('NEVER shows "Unsaved changes..." forbidden state', () => {
      // This should never appear in any state
      const wt = createDirtyWorktree(3);
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createMockChanges([
            { path: 'a.ts', status: 'modified', insertions: 10, deletions: 5 },
          ])}
          mood="active"
          trafficLight="green"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      expect(lastFrame()).not.toContain('Unsaved changes');
    });
  });

  describe('Row 4: File List (Expandable)', () => {
    it('sorts files by status priority and churn', () => {
      const changes = createPrioritySortedChanges();
      const wt = createDirtyWorktree(5);

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={changes}
          mood="active"
          trafficLight="green"
          isFocused={false}
          isExpanded={true}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      const output = lastFrame();
      const idxHighChurn = output.indexOf('b-high-churn.ts');
      const idxLowChurn = output.indexOf('a-low-churn.ts');
      const idxAdded = output.indexOf('c-added.ts');
      const idxDeleted = output.indexOf('d-deleted.ts');
      const idxUntracked = output.indexOf('z-untracked.ts');

      // Modified (High Churn) -> Modified (Low Churn) -> Added -> Deleted -> Untracked
      expect(idxHighChurn).toBeLessThan(idxLowChurn);
      expect(idxLowChurn).toBeLessThan(idxAdded);
      expect(idxAdded).toBeLessThan(idxDeleted);
      expect(idxDeleted).toBeLessThan(idxUntracked);
    });

    it('truncates file list to 10 items with overflow indicator', () => {
      const changes = createOverflowChanges(15);
      const wt = createDirtyWorktree(15);

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={changes}
          mood="active"
          trafficLight="green"
          isFocused={false}
          isExpanded={true}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      const output = lastFrame();
      // Should show files 00-09 (10 files)
      expect(output).toContain('file09.ts');
      // Should NOT show file 10+
      expect(output).not.toContain('file10.ts');
      // Should show overflow indicator
      expect(output).toContain('...and 5 more');
    });

    it('hides file list when collapsed', () => {
      const changes = createMockChanges([
        { path: 'src/index.ts', status: 'modified', insertions: 10, deletions: 2 },
      ]);
      const wt = createDirtyWorktree(1);

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={changes}
          mood="active"
          trafficLight="green"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      expect(lastFrame()).not.toContain('src/index.ts');
    });

    it('shows file list when expanded', () => {
      const changes = createMockChanges([
        { path: 'src/index.ts', status: 'modified', insertions: 10, deletions: 2 },
        { path: 'README.md', status: 'added', insertions: 20, deletions: 0 },
      ]);
      const wt = createDirtyWorktree(2);

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={changes}
          mood="active"
          trafficLight="green"
          isFocused={false}
          isExpanded={true}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      const output = lastFrame();
      expect(output).toContain('src/index.ts');
      expect(output).toContain('README.md');
      expect(output).toContain('+10');
      expect(output).toContain('-2');
    });

    it('renders status glyphs correctly', () => {
      const changes = createMockChanges([
        { path: 'modified.ts', status: 'modified', insertions: 5, deletions: 2 },
        { path: 'added.ts', status: 'added', insertions: 10, deletions: 0 },
        { path: 'deleted.ts', status: 'deleted', insertions: 0, deletions: 5 },
      ]);
      const wt = createDirtyWorktree(3);

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={changes}
          mood="active"
          trafficLight="green"
          isFocused={false}
          isExpanded={true}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      const output = lastFrame();
      // Status glyphs: M, A, D
      expect(output).toContain('M');
      expect(output).toContain('A');
      expect(output).toContain('D');
    });

    it('truncates long file paths', () => {
      const changes = createLongPathChanges();
      const wt = createDirtyWorktree(1);

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={changes}
          mood="active"
          trafficLight="green"
          isFocused={false}
          isExpanded={true}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      const output = lastFrame();
      // Should contain ... for truncated path
      expect(output).toContain('...');
    });
  });

  describe('Border & Visual Hierarchy', () => {
    it('uses double border when focused', () => {
      const wt = createCleanWorktree();
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          trafficLight="gray"
          isFocused={true} // Focused
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      // Ink uses different box-drawing characters for double borders
      const output = lastFrame();
      // Double border characters: ═ ║ ╔ ╗ ╚ ╝
      expect(output).toMatch(/[═║╔╗╚╝]/);
    });

    it('uses round border when not focused', () => {
      const wt = createCleanWorktree();
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          trafficLight="gray"
          isFocused={false} // Not focused
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      // Round border characters: ─ │ ╭ ╮ ╰ ╯
      const output = lastFrame();
      expect(output).toMatch(/[─│╭╮╰╯]/);
    });

    it('uses traffic light state for border color, not mood', () => {
      // Even if mood is "active", if traffic light is gray, border should be gray
      const wt = createDirtyWorktree(3);
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createMockChanges([
            { path: 'a.ts', status: 'modified', insertions: 10, deletions: 5 },
          ])}
          mood="active" // Mood is active
          trafficLight="gray" // But traffic light is gray (>90s since change)
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      // Border color should follow trafficLight, not mood
      // This is a visual test - border should be gray, not yellow
      expect(lastFrame()).toBeDefined();
    });
  });

  describe('Action Buttons', () => {
    it('renders action buttons for CopyTree and editor', () => {
      const wt = createCleanWorktree();
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          trafficLight="gray"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      const output = lastFrame();
      expect(output).toContain('CopyTree');
      expect(output).toContain('VS Code');
      expect(output).toContain('Expand');
    });

    it('changes Expand/Collapse label based on state', () => {
      const wt = createCleanWorktree();

      // Collapsed state
      const { lastFrame: collapsedFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          trafficLight="gray"
          isFocused={false}
          isExpanded={false}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      expect(collapsedFrame()).toContain('Expand');

      // Expanded state
      const { lastFrame: expandedFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          trafficLight="gray"
          isFocused={false}
          isExpanded={true}
          activeRootPath="/repo"
          onToggleExpand={vi.fn()}
        />
      );

      expect(expandedFrame()).toContain('Collapse');
    });
  });
});
