import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { Header } from '../../src/components/Header.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import type { ProjectIdentity } from '../../src/services/ai/index.js';

describe('Header', () => {
  const renderWithTheme = (component: React.ReactElement) => {
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

  it('renders identity and basic stats', () => {
    const { lastFrame } = renderWithTheme(
      <Header
        cwd="/Users/dev/project"
        filterActive={false}
        filterQuery=""
        worktreeCount={3}
        activeWorktreeCount={1}
        identity={mockIdentity}
        config={DEFAULT_CONFIG}
      />
    );

    const output = lastFrame();
    expect(output).toContain('Canopy');
    expect(output).toContain('🌳');
    expect(output).toContain('3 worktrees • 1 active');
  });

  it('renders singular worktree count correctly', () => {
    const { lastFrame } = renderWithTheme(
      <Header
        cwd="/Users/dev/project"
        filterActive={false}
        filterQuery=""
        worktreeCount={1}
        activeWorktreeCount={0}
        identity={mockIdentity}
        config={DEFAULT_CONFIG}
      />
    );

    const output = lastFrame();
    expect(output).toContain('1 worktree');
    expect(output).not.toContain('worktrees');
    expect(output).not.toContain('active');
  });

  it('renders filter query inline when active', () => {
    const { lastFrame } = renderWithTheme(
      <Header
        cwd="/Users/dev/project"
        filterActive={true}
        filterQuery=".ts"
        identity={mockIdentity}
        config={DEFAULT_CONFIG}
      />
    );

    const output = lastFrame();
    expect(output).toContain('Filter:');
    expect(output).toContain('.ts');
  });

  it('does not render redundant path or branch information', () => {
    const { lastFrame } = renderWithTheme(
      <Header
        cwd="/Users/dev/project"
        filterActive={false}
        filterQuery=""
        worktreeCount={3}
        identity={mockIdentity}
        config={DEFAULT_CONFIG}
      />
    );

    const output = lastFrame();
    expect(output).not.toContain('/Users/dev/project');
    expect(output).not.toContain('⎇');
    expect(output).not.toContain('main');
  });

  it('does not render git view mode toggle hints', () => {
    const { lastFrame } = renderWithTheme(
      <Header
        cwd="/Users/dev/project"
        filterActive={false}
        filterQuery=""
        identity={mockIdentity}
        config={DEFAULT_CONFIG}
        gitOnlyMode={true}
      />
    );

    const output = lastFrame();
    expect(output).not.toContain('[Git Changes]');
    expect(output).not.toContain('[All Files]');
  });
});
