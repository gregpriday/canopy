import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';
import { Header } from '../../src/components/Header.js';
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

  it('renders identity', () => {
    const { lastFrame } = renderWithTheme(
      <Header
        cwd="/Users/dev/project"
        filterActive={false}
        filterQuery=""
        identity={mockIdentity}
        terminalWidth={80}
      />
    );

    const output = lastFrame();
    expect(output).toContain('Canopy');
    expect(output).toContain('🌳');
  });

  it('renders filter query inline when active', () => {
    const { lastFrame } = renderWithTheme(
      <Header
        cwd="/Users/dev/project"
        filterActive={true}
        filterQuery=".ts"
        identity={mockIdentity}
        terminalWidth={80}
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
        identity={mockIdentity}
        terminalWidth={120}
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
        terminalWidth={80}
      />
    );

    const output = lastFrame();
    expect(output).not.toContain('[Git Changes]');
    expect(output).not.toContain('[All Files]');
  });
});
