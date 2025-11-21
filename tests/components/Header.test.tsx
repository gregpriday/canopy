import React from 'react';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { render } from 'ink-testing-library';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { describe, it, expect, vi } from 'vitest';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { Header } from '../../src/components/Header.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import type { Worktree } from '../../src/types/index.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import type { ProjectIdentity } from '../../src/services/emoji/cache.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';

describe('Header', () => {
  const renderWithTheme = (component) => {
    return render(
      <ThemeProvider mode="dark">
        {component}
      </ThemeProvider>
    );
  };

  const mockIdentity: ProjectIdentity = {
    emoji: '🌳',
    title: 'Canopy',
    gradientStart: '#00FF00',
    gradientEnd: '#0000FF',
  };

  const mockWorktree: Worktree = {
    id: '/Users/dev/project',
    path: '/Users/dev/project',
    name: 'main',
    branch: 'main',
    isCurrent: true,
  };

  describe('basic rendering', () => {
    it('renders app name and cwd without worktree info', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('Canopy');
      // Path is rendered as breadcrumbs with " / " separators
      expect(output).toContain('Users / dev / project');
      expect(output).not.toContain('wt'); // No worktree indicator
    });

    it('renders worktree indicator when currentWorktree provided', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          currentWorktree={mockWorktree}
          worktreeCount={3}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('Canopy');
      expect(output).toContain('wt');
      expect(output).toContain('[main]');
      expect(output).toContain('(3)');
    });

    it('shows relative path when in worktree subdirectory', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project/src/components"
          filterActive={false}
          filterQuery=""
          currentWorktree={mockWorktree}
          worktreeCount={2}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      // Relative path rendered as breadcrumbs: "src / components"
      expect(output).toContain('src / components');
      expect(output).not.toContain('Users / dev / project / src / components');
    });

    it('shows absolute path when cwd is outside worktree', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/other-project"
          filterActive={false}
          filterQuery=""
          currentWorktree={mockWorktree}
          worktreeCount={1}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      // Absolute path rendered as breadcrumbs
      expect(output).toContain('Users / dev / other-project');
    });

    it('shows absolute path for prefix-only match (not descendant)', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project-old"
          filterActive={false}
          filterQuery=""
          currentWorktree={mockWorktree}
          worktreeCount={1}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      // Should show full absolute path as breadcrumbs, not a mangled relative path
      expect(output).toContain('Users / dev / project-old');
      // Verify it's showing the absolute path, not trying to make it relative
      expect(output).not.toMatch(/•\s+old/); // Would be wrong relative path
    });

    it('shows root path (/) when at worktree root', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          currentWorktree={mockWorktree}
          worktreeCount={1}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('•');
      // Should show / for root, not empty string
      expect(output).toMatch(/•\s+\//); // • followed by /
    });

    it('renders filter indicator when active', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={true}
          filterQuery=".ts"
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('[*]');
      expect(output).toContain('.ts');
    });

    it('renders both worktree and filter indicators together', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={true}
          filterQuery="*.tsx"
          currentWorktree={mockWorktree}
          worktreeCount={2}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('wt');
      expect(output).toContain('[main]');
      expect(output).toContain('(2)');
      expect(output).toContain('[*]');
      expect(output).toContain('*.tsx');
    });

    it('does not show filter indicator when filterActive is false with query', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=".ts"
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).not.toContain('[*]');
      expect(output).not.toContain('.ts');
    });

    it('shows filter indicator when active with empty query', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={true}
          filterQuery=""
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('[*]');
    });
  });

  describe('worktree scenarios', () => {
    it('handles single worktree (count = 1)', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          currentWorktree={mockWorktree}
          worktreeCount={1}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('(1)');
    });

    it('handles multiple worktrees', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          currentWorktree={mockWorktree}
          worktreeCount={5}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('(5)');
    });

    it('handles detached HEAD state', () => {
      const detachedWorktree: Worktree = {
        id: '/Users/dev/project',
        path: '/Users/dev/project',
        name: 'detached',
        branch: undefined, // No branch in detached state
        isCurrent: true,
      };

      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          currentWorktree={detachedWorktree}
          worktreeCount={1}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('[detached]');
    });

    it('handles feature branch with slashes', () => {
      const featureWorktree: Worktree = {
        id: '/Users/dev/project-feature',
        path: '/Users/dev/project-feature',
        name: 'feature/auth',
        branch: 'feature/auth',
        isCurrent: true,
      };

      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project-feature"
          filterActive={false}
          filterQuery=""
          currentWorktree={featureWorktree}
          worktreeCount={2}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('[feature/auth]');
    });

    it('truncates very long branch names', () => {
      const longBranchWorktree: Worktree = {
        id: '/Users/dev/project',
        path: '/Users/dev/project',
        name: 'feature/this-is-a-very-long-branch-name-that-should-be-truncated',
        branch: 'feature/this-is-a-very-long-branch-name-that-should-be-truncated',
        isCurrent: true,
      };

      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          currentWorktree={longBranchWorktree}
          worktreeCount={1}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      // Should contain exact truncated string (19 chars + ellipsis = 20 total)
      expect(output).toContain('[feature/this-is-a-v…]');
      // Full branch name should NOT be present
      expect(output).not.toContain('feature/this-is-a-very-long-branch-name-that-should-be-truncated');
    });

    it('shows worktree indicator even without explicit worktreeCount', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          currentWorktree={mockWorktree}
          identity={mockIdentity}
          // worktreeCount not passed (defaults to 0)
        />
      );

      const output = lastFrame();
      expect(output).toContain('wt');
      expect(output).toContain('[main]');
      expect(output).toContain('(0)');
    });

    it('does not show worktree indicator when currentWorktree is null', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          currentWorktree={null}
          worktreeCount={3}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).not.toContain('wt');
    });

    it('does not show worktree indicator when currentWorktree is undefined', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          identity={mockIdentity}
          // currentWorktree not passed (undefined)
          worktreeCount={3}
        />
      );

      const output = lastFrame();
      expect(output).not.toContain('wt');
    });

    it('uses worktree name as fallback when branch is undefined (detached HEAD)', () => {
      const detachedWithName: Worktree = {
        id: '/Users/dev/project',
        path: '/Users/dev/project',
        name: 'canopy-issue-42',
        branch: undefined,
        isCurrent: true,
      };

      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          currentWorktree={detachedWithName}
          worktreeCount={1}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('[canopy-issue-42]');
      expect(output).not.toContain('[detached]');
    });
  });

  describe('visual styling', () => {
    it('uses bullet separator (•) not dash (-)', () => {
      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          currentWorktree={mockWorktree}
          worktreeCount={2}
          identity={mockIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('•');
      // Should not have the old " - " separator format
      expect(output).not.toMatch(/Canopy\s+-\s+/);
    });
  });

  describe('emoji rendering', () => {
    it('renders project emoji when provided', () => {
      const emojiIdentity: ProjectIdentity = {
        emoji: '🚀',
        title: 'Canopy',
        gradientStart: '#00FF00',
        gradientEnd: '#0000FF',
      };

      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          identity={emojiIdentity}
        />
      );

      const output = lastFrame();
      expect(output).toContain('🚀');
    });

    it('does not render emoji space when emoji is null', () => {
      const noEmojiIdentity: ProjectIdentity = {
        emoji: '',
        title: 'Canopy',
        gradientStart: '#00FF00',
        gradientEnd: '#0000FF',
      };

      const { lastFrame } = renderWithTheme(
        <Header
          cwd="/Users/dev/project"
          filterActive={false}
          filterQuery=""
          identity={noEmojiIdentity}
        />
      );

      const output = lastFrame();
      // Should just start with Canopy (ignoring border chars)
      expect(output).toContain('Canopy');
      expect(output).not.toContain('🚀');
    });
  });
});
