import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { StatusBar } from '../../src/components/StatusBar.js';
import type { Notification } from '../../src/types/index.js';

describe('StatusBar', () => {
  // Mock props
  const defaultProps = {
    notification: null,
    fileCount: 10,
    modifiedCount: 0,
    activeRootPath: '.',
    commandMode: false,
  };

  describe('basic statistics display', () => {
    it('displays file count with no modifications', () => {
      const { lastFrame } = render(
        <StatusBar
          {...defaultProps}
          fileCount={12}
          modifiedCount={0}
        />
      );

      const output = lastFrame();
      expect(output).toContain('12 files');
      expect(output).not.toContain('modified');
    });

    it('displays file count and modified count', () => {
      const { lastFrame } = render(
        <StatusBar
          {...defaultProps}
          fileCount={42}
          modifiedCount={5}
        />
      );

      const output = lastFrame();
      expect(output).toContain('42 files');
      expect(output).toContain('5 modified');
    });

    it('displays Copy Tree button', () => {
      const { lastFrame } = render(
        <StatusBar
          {...defaultProps}
        />
      );

      const output = lastFrame();
      expect(output).toContain('CopyTree');
    });
  });

  describe('filter display', () => {
    it('displays name filter when active', () => {
      const { lastFrame } = render(
        <StatusBar
          {...defaultProps}
          filterQuery=".ts"
        />
      );

      const output = lastFrame();
      expect(output).toContain('/filter: .ts');
    });

    it('displays git status filter when active', () => {
      const { lastFrame } = render(
        <StatusBar
          {...defaultProps}
          filterGitStatus="modified"
        />
      );

      const output = lastFrame();
      expect(output).toContain('/git: modified');
    });
  });

  describe('command mode', () => {
    it('shows inline input when command mode is active', () => {
      const { lastFrame } = render(
        <StatusBar
          {...defaultProps}
          commandMode={true}
        />
      );

      const output = lastFrame();
      // Input prompt /
      expect(output).toContain('/');
      // Stats should be hidden or replaced (depending on implementation, in my case replaced)
      expect(output).not.toContain('10 files');
    });
  });

  describe('notification display', () => {
    it('shows notification and hides stats', () => {
      const notification: Notification = {
        type: 'success',
        message: 'Operation completed',
      };

      const { lastFrame } = render(
        <StatusBar
          {...defaultProps}
          notification={notification}
        />
      );

      const output = lastFrame();
      expect(output).toContain('Operation completed');
      expect(output).not.toContain('10 files');
    });
  });
});
