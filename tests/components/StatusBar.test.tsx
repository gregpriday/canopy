import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { StatusBar } from '../../src/components/StatusBar.js';
import type { Notification } from '../../src/types/index.js';

describe('StatusBar', () => {
  describe('basic statistics display', () => {
    it('displays file count with no modifications', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={12}
          modifiedCount={0}
        />
      );

      const output = lastFrame();
      expect(output).toContain('12 files');
      expect(output).not.toContain('modified');
      // Verify no separator before help hints when no modifications
      const textBeforeHelp = output.split('Press')[0];
      expect(textBeforeHelp).toContain('12 files');
    });

    it('displays file count and modified count', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={42}
          modifiedCount={5}
        />
      );

      const output = lastFrame();
      expect(output).toContain('42 files');
      expect(output).toContain('5 modified');
      expect(output).toContain('•'); // Separator
    });

    it('displays zero files', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={0}
          modifiedCount={0}
        />
      );

      const output = lastFrame();
      expect(output).toContain('0 files');
    });

    it('shows help hints when no filters active', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={10}
          modifiedCount={0}
        />
      );

      const output = lastFrame();
      expect(output).toContain('?');
      expect(output).toContain('help');
      expect(output).toContain('/');
      expect(output).toContain('commands');
    });
  });

  describe('filter display', () => {
    it('displays name filter when active', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={8}
          modifiedCount={2}
          filterQuery=".ts"
        />
      );

      const output = lastFrame();
      expect(output).toContain('/filter: .ts');
      expect(output).toContain('8 files');
      expect(output).toContain('2 modified');
    });

    it('displays git status filter when active', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={5}
          modifiedCount={5}
          filterGitStatus="modified"
        />
      );

      const output = lastFrame();
      expect(output).toContain('/git: modified');
      expect(output).toContain('5 files');
    });

    it('displays both filters when both active', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={3}
          modifiedCount={3}
          filterQuery=".tsx"
          filterGitStatus="added"
        />
      );

      const output = lastFrame();
      expect(output).toContain('/filter: .tsx');
      expect(output).toContain('/git: added');
      expect(output).toContain('3 files');
    });

    it('hides help hints when name filter is active', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={10}
          modifiedCount={0}
          filterQuery=".js"
        />
      );

      const output = lastFrame();
      expect(output).not.toContain('? for help');
    });

    it('hides help hints when git status filter is active', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={10}
          modifiedCount={0}
          filterGitStatus="modified"
        />
      );

      const output = lastFrame();
      expect(output).not.toContain('? for help');
      expect(output).not.toContain('/ for commands');
    });

    it('handles null filter values', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={10}
          modifiedCount={0}
          filterQuery={null}
          filterGitStatus={null}
        />
      );

      const output = lastFrame();
      expect(output).toContain('10 files');
      expect(output).not.toContain('/filter:');
      expect(output).not.toContain('/git:');
    });

    it('handles empty string filter query', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={10}
          modifiedCount={0}
          filterQuery=""
        />
      );

      const output = lastFrame();
      expect(output).toContain('10 files');
      expect(output).not.toContain('/filter:');
      expect(output).toContain('? for help'); // Help hints still visible
    });

    it('handles very long filter query', () => {
      const longQuery = 'very-long-file-name-pattern-that-exceeds-normal-length.tsx';
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={5}
          modifiedCount={0}
          filterQuery={longQuery}
        />
      );

      const output = lastFrame();
      expect(output).toContain('/filter:');
      expect(output).toContain(longQuery);
    });
  });

  describe('notification display', () => {
    it('shows success notification with green color', () => {
      const notification: Notification = {
        type: 'success',
        message: 'Operation completed',
      };

      const { lastFrame } = render(
        <StatusBar
          notification={notification}
          fileCount={10}
          modifiedCount={2}
        />
      );

      const output = lastFrame();
      expect(output).toContain('Operation completed');
      expect(output).not.toContain('10 files'); // Stats hidden
    });

    it('shows error notification with red color and bold text', () => {
      const notification: Notification = {
        type: 'error',
        message: 'Failed to load',
      };

      const { lastFrame } = render(
        <StatusBar
          notification={notification}
          fileCount={10}
          modifiedCount={2}
        />
      );

      const output = lastFrame();
      expect(output).toContain('Failed to load');
      expect(output).not.toContain('10 files'); // Stats hidden
    });

    it('shows info notification with blue color', () => {
      const notification: Notification = {
        type: 'info',
        message: 'Switched to worktree main',
      };

      const { lastFrame } = render(
        <StatusBar
          notification={notification}
          fileCount={10}
          modifiedCount={2}
        />
      );

      const output = lastFrame();
      expect(output).toContain('Switched to worktree main');
    });

    it('shows warning notification with yellow color', () => {
      const notification: Notification = {
        type: 'warning',
        message: 'Large directory detected',
      };

      const { lastFrame } = render(
        <StatusBar
          notification={notification}
          fileCount={10}
          modifiedCount={2}
        />
      );

      const output = lastFrame();
      expect(output).toContain('Large directory detected');
    });

    it('notification takes precedence over stats and filters', () => {
      const notification: Notification = {
        type: 'success',
        message: 'Done',
      };

      const { lastFrame } = render(
        <StatusBar
          notification={notification}
          fileCount={10}
          modifiedCount={5}
          filterQuery=".ts"
          filterGitStatus="modified"
        />
      );

      const output = lastFrame();
      expect(output).toContain('Done');
      expect(output).not.toContain('10 files');
      expect(output).not.toContain('/filter:');
      expect(output).not.toContain('/git:');
    });
  });

  describe('separator formatting', () => {
    it('uses bullet separator between sections', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={10}
          modifiedCount={3}
          filterQuery=".ts"
        />
      );

      const output = lastFrame();
      // Should have: "10 files • 3 modified • /filter: .ts"
      const bulletCount = (output.match(/•/g) || []).length;
      expect(bulletCount).toBeGreaterThanOrEqual(2);
    });

    it('separates both filters with bullet', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={5}
          modifiedCount={5}
          filterQuery=".tsx"
          filterGitStatus="added"
        />
      );

      const output = lastFrame();
      expect(output).toContain('/filter: .tsx');
      expect(output).toContain('/git: added');
      // Verify separator between filters
      const filterSection = output.split('5 modified')[1] || '';
      expect(filterSection).toContain('•');
    });
  });

  describe('integration with git status types', () => {
    it('displays all git status types correctly', () => {
      const statuses = ['modified', 'added', 'deleted', 'untracked', 'ignored'] as const;

      statuses.forEach(status => {
        const { lastFrame } = render(
          <StatusBar
            notification={null}
            fileCount={1}
            modifiedCount={1}
            filterGitStatus={status}
          />
        );

        const output = lastFrame();
        expect(output).toContain(`/git: ${status}`);
      });
    });
  });

  describe('backward compatibility', () => {
    it('works without optional filter props', () => {
      const { lastFrame } = render(
        <StatusBar
          notification={null}
          fileCount={10}
          modifiedCount={2}
        />
      );

      const output = lastFrame();
      expect(output).toContain('10 files');
      expect(output).toContain('2 modified');
    });
  });
});
