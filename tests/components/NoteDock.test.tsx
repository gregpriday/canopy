import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { NoteDock } from '../../src/components/NoteDock.js';
import { ThemeProvider } from '../../src/theme/ThemeProvider.js';

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider mode="dark">{component}</ThemeProvider>);

describe('NoteDock', () => {
  describe('Conditional Rendering', () => {
    it('renders nothing when noteContent is undefined', () => {
      const { lastFrame } = renderWithTheme(
        <NoteDock noteContent={undefined} />
      );

      // Should be empty or just whitespace
      const output = lastFrame();
      expect(output?.trim() || '').toBe('');
    });

    it('renders nothing when noteContent is empty string', () => {
      const { lastFrame } = renderWithTheme(
        <NoteDock noteContent="" />
      );

      // NoteDock checks for truthy content, empty string should not render
      const output = lastFrame();
      expect(output?.trim() || '').toBe('');
    });

    it('renders content when noteContent is provided', () => {
      const { lastFrame } = renderWithTheme(
        <NoteDock noteContent="Building feature X - running tests" />
      );

      const output = lastFrame();
      expect(output).toContain('Building feature X - running tests');
    });
  });

  describe('Visual Elements', () => {
    it('renders with border separator', () => {
      const { lastFrame } = renderWithTheme(
        <NoteDock noteContent="Test note content" />
      );

      const output = lastFrame();
      // Should contain horizontal border characters
      expect(output).toMatch(/[─│]/);
    });
  });

  describe('Content Display', () => {
    it('displays the full note content', () => {
      const noteText = 'Working on authentication - 5/10 tests passing';
      const { lastFrame } = renderWithTheme(
        <NoteDock noteContent={noteText} />
      );

      expect(lastFrame()).toContain(noteText);
    });

    it('handles special characters in note content', () => {
      const noteWithSpecialChars = 'Building: src/*.ts → dist/*.js';
      const { lastFrame } = renderWithTheme(
        <NoteDock noteContent={noteWithSpecialChars} />
      );

      expect(lastFrame()).toContain('Building:');
      expect(lastFrame()).toContain('→');
    });

    it('handles emoji in note content', () => {
      const noteWithEmoji = '🚀 Deploying to staging environment';
      const { lastFrame } = renderWithTheme(
        <NoteDock noteContent={noteWithEmoji} />
      );

      expect(lastFrame()).toContain('🚀');
      expect(lastFrame()).toContain('Deploying to staging');
    });
  });
});
