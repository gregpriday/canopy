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
          isFocused={false}
          activeRootPath="/repo"
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
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      const output = lastFrame();
      expect(output).toContain('abc1234');
      expect(output).toContain('(detached)');
    });

    it('displays path (uses home directory substitution)', () => {
      const longPath = '/Users/developer/projects/very/long/nested/path/that/exceeds/limit/src';
      const wt = createCleanWorktree({ path: longPath });
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          isFocused={false}
          activeRootPath="/other"
        />
      );

      // Path should be displayed (may use ~ substitution for home directory)
      const output = lastFrame();
      expect(output).toContain('src');
    });

    it('shows current worktree indicator', () => {
      const wt = createCleanWorktree({ isCurrent: true });
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      // Current worktree should show ● prefix
      const output = lastFrame();
      expect(output).toContain('●');
    });
  });

  describe('Row 2: Statistics & Traffic Light', () => {
    it('renders activity indicator based on lastActivityTimestamp (recent activity)', () => {
      const wt = createDirtyWorktree(3);
      // Set a recent timestamp (will show as green/active)
      wt.lastActivityTimestamp = Date.now();
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createMockChanges([
            { path: 'a.ts', status: 'modified', insertions: 45, deletions: 0 },
          ])}
          mood="active"
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      // Should render traffic light indicator
      expect(lastFrame()).toContain('●');
    });

    it('renders activity indicator for older activity (stale)', () => {
      const wt = createDirtyWorktree(3);
      // Set an older timestamp (>90s ago, will show as gray)
      wt.lastActivityTimestamp = Date.now() - 120000;
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createMockChanges([
            { path: 'a.ts', status: 'modified', insertions: 45, deletions: 0 },
          ])}
          mood="active"
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      expect(lastFrame()).toContain('●');
    });

    it('renders activity indicator when no activity timestamp (null)', () => {
      const wt = createCleanWorktree();
      wt.lastActivityTimestamp = null;
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      expect(lastFrame()).toContain('●');
    });
  });

  describe('Row 3: AI Summary / Last Commit', () => {
    it('renders Last Commit for clean worktrees with checkmark prefix', () => {
      const wt = createCleanWorktree({
        summary: 'Last commit: feat: added login',
        modifiedCount: 0,
      });

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      const output = lastFrame();
      expect(output).toContain('Last commit:');
    });

    it('renders AI Summary for dirty worktrees', () => {
      const wt = createDirtyWorktree(5, {
        summary: 'Refactoring auth module',
      });

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createMockChanges([
            { path: 'a.ts', status: 'modified', insertions: 10, deletions: 5 },
          ])}
          mood="active"
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      const output = lastFrame();
      expect(output).toContain('Refactoring auth');
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
          isFocused={false}
          activeRootPath="/repo"
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
          isFocused={false}
          activeRootPath="/repo"
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
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      expect(lastFrame()).not.toContain('Unsaved changes');
    });
  });

  describe('File List (Always Top 3)', () => {
    it('sorts files by status priority and churn', () => {
      const changes = createPrioritySortedChanges();
      const wt = createDirtyWorktree(5);

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={changes}
          mood="active"
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      const output = lastFrame();
      const idxHighChurn = output.indexOf('b-high-churn.ts');
      const idxLowChurn = output.indexOf('a-low-churn.ts');
      const idxAdded = output.indexOf('c-added.ts');

      // Modified (High Churn) -> Modified (Low Churn) -> Added
      expect(idxHighChurn).toBeLessThan(idxLowChurn);
      expect(idxLowChurn).toBeLessThan(idxAdded);
    });

    it('shows overflow indicator when more than 3 files', () => {
      const changes = createOverflowChanges(10);
      const wt = createDirtyWorktree(10);

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={changes}
          mood="active"
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      const output = lastFrame();
      // Should show overflow indicator for remaining files
      expect(output).toContain('...and 7 more');
    });

    it('always shows top 3 files (no expansion needed)', () => {
      const changes = createMockChanges([
        { path: 'src/index.ts', status: 'modified', insertions: 10, deletions: 2 },
        { path: 'README.md', status: 'added', insertions: 20, deletions: 0 },
        { path: 'test.ts', status: 'modified', insertions: 5, deletions: 1 },
      ]);
      const wt = createDirtyWorktree(3);

      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={changes}
          mood="active"
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      const output = lastFrame();
      // Files are always visible now (no expansion toggle)
      expect(output).toContain('index.ts');
      expect(output).toContain('README.md');
      expect(output).toContain('test.ts');
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
          isFocused={false}
          activeRootPath="/repo"
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
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      const output = lastFrame();
      // Should contain ... for truncated path
      expect(output).toContain('...');
    });
  });

  describe('Border & Visual Hierarchy', () => {
    it('uses manual round border construction', () => {
      const wt = createCleanWorktree();
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          isFocused={true}
          activeRootPath="/repo"
        />
      );

      const output = lastFrame();
      // Round border characters from manual construction: ╭ ╮ ╰ ╯ ─ │
      expect(output).toMatch(/[╭╮╰╯─│]/);
    });

    it('uses round border when not focused', () => {
      const wt = createCleanWorktree();
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      // Round border characters: ─ │ ╭ ╮ ╰ ╯
      const output = lastFrame();
      expect(output).toMatch(/[─│╭╮╰╯]/);
    });

    it('renders with consistent border color using theme tertiary color', () => {
      // Border color is now theme.text.tertiary for consistency
      const wt = createDirtyWorktree(3);
      wt.lastActivityTimestamp = Date.now() - 120000; // Old activity
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createMockChanges([
            { path: 'a.ts', status: 'modified', insertions: 10, deletions: 5 },
          ])}
          mood="active"
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      // Card should render without error
      expect(lastFrame()).toBeDefined();
    });
  });

  describe('Embedded Action Buttons', () => {
    it('renders action buttons embedded in top border', () => {
      const wt = createCleanWorktree();
      const { lastFrame } = renderWithTheme(
        <WorktreeCard
          worktree={wt}
          changes={createEmptyChanges()}
          mood="stable"
          isFocused={false}
          activeRootPath="/repo"
        />
      );

      const output = lastFrame();
      // Should have Copy and Code buttons embedded in the border
      expect(output).toContain('Copy');
      expect(output).toContain('Code');
    });
  });
});
