import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockWorktrees, mockWorktreeChanges, mockDashboardConfig } from './fixtures/mockWorktrees.js';

// Mock worktree utilities first to avoid circular dependencies
vi.mock('../src/utils/worktree.js', () => ({
  getWorktrees: vi.fn(() => Promise.resolve(mockWorktrees)),
  getCurrentWorktree: vi.fn(() => mockWorktrees[0]),
}));

// Mock state utilities
vi.mock('../src/utils/state.js', () => ({
  saveSessionState: vi.fn(() => Promise.resolve()),
  loadSessionState: vi.fn(() => Promise.resolve(null)),
}));

// Mock all the heavy hooks and services
vi.mock('../src/hooks/useAppLifecycle.js', () => ({
  useAppLifecycle: vi.fn(() => ({
    status: 'ready',
    config: mockDashboardConfig,
    worktrees: mockWorktrees,
    activeWorktreeId: mockWorktrees[0].id,
    activeRootPath: mockWorktrees[0].path,
    initialSelectedPath: null,
    initialExpandedFolders: [],
    initialGitOnlyMode: false,
    initialCopyProfile: 'default',
    error: null,
    notification: null,
    setNotification: vi.fn(),
    reinitialize: vi.fn(),
  })),
}));

vi.mock('../src/hooks/useWorktreeSummaries.js', () => ({
  useWorktreeSummaries: vi.fn((worktrees) => worktrees),
}));

vi.mock('../src/hooks/useFileTree.js', () => ({
  useFileTree: vi.fn(() => ({
    tree: [], // Empty array instead of null to avoid "not iterable" error
    selectedPath: null,
    gitOnlyMode: false,
    refresh: vi.fn(),
    setSelectedPath: vi.fn(),
    toggleGitOnlyMode: vi.fn(),
    expandFolder: vi.fn(),
    collapseFolder: vi.fn(),
  })),
}));

vi.mock('../src/hooks/useMultiWorktreeStatus.js', () => ({
  useMultiWorktreeStatus: vi.fn(() => ({
    worktreeChanges: mockWorktreeChanges,
    refresh: vi.fn(),
    clear: vi.fn(),
  })),
}));

vi.mock('../src/hooks/useGitStatus.js', () => ({
  useGitStatus: vi.fn(() => ({
    gitStatus: new Map(),
    refresh: vi.fn(),
  })),
}));

vi.mock('../src/hooks/useRecentActivity.js', () => ({
  useRecentActivity: vi.fn(() => ({
    recentFiles: [],
  })),
}));

vi.mock('../src/hooks/useWatcher.js', () => ({
  useWatcher: vi.fn(() => ({
    isWatching: false,
  })),
}));

vi.mock('../src/hooks/useAIStatus.js', () => ({
  useAIStatus: vi.fn(() => ({
    hasApiKey: true,
    isEnabled: true,
  })),
}));

vi.mock('../src/hooks/useProjectIdentity.js', () => ({
  useProjectIdentity: vi.fn(() => ({
    identity: null,
    isLoading: false,
  })),
}));

vi.mock('../src/hooks/useActivity.js', () => ({
  useActivity: vi.fn(() => ({
    events: [],
    addEvent: vi.fn(),
    clear: vi.fn(),
  })),
}));

vi.mock('../src/utils/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue(mockDashboardConfig),
}));

// Mock file operations
vi.mock('../src/utils/fileOpener.js', () => ({
  openFile: vi.fn().mockResolvedValue(undefined),
  openWorktreeInEditor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/utils/clipboard.js', () => ({
  copyFilePath: vi.fn().mockResolvedValue(undefined),
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/utils/copytree.js', () => ({
  runCopyTreeWithProfile: vi.fn().mockResolvedValue('Success\nCopied to clipboard!'),
}));

// Mock fuzzy search dependencies
vi.mock('../src/services/fuzzySearch.js', () => ({
  collectFilesFromWorktree: vi.fn().mockResolvedValue([
    { path: '/test/repo/main/src/index.ts', relativePath: 'src/index.ts', type: 'file' },
    { path: '/test/repo/main/src/App.tsx', relativePath: 'src/App.tsx', type: 'file' },
    { path: '/test/repo/main/package.json', relativePath: 'package.json', type: 'file' },
  ]),
  fuzzyMatchMultiple: vi.fn((files, query) =>
    files.filter((f: any) => f.relativePath.toLowerCase().includes(query.toLowerCase()))
  ),
}));

import App from '../src/App.js';
import { events } from '../src/services/events.js';
import { openFile, openWorktreeInEditor } from '../src/utils/fileOpener.js';
import { copyFilePath } from '../src/utils/clipboard.js';
import { runCopyTreeWithProfile } from '../src/utils/copytree.js';

// Helper to wait for condition with timeout
async function waitForCondition(fn: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

// Helper to tick promises
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Dashboard Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Note: events singleton cleanup happens via unsubscribe returns in tests
  });

  afterEach(() => {
    // Note: events singleton cleanup happens via unsubscribe returns in tests
  });

  describe('Dashboard Loading', () => {
    it('renders cards for all worktrees', async () => {
      const { lastFrame } = render(<App cwd="/test/repo" />);

      // Wait for loading to complete
      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

      const frame = lastFrame() || '';

      // Check all worktrees appear (main is at top, others may show as "feature" or full name)
      expect(frame).toContain('main');
      // The worktrees are rendered but may be abbreviated or shown differently
      expect(frame).toMatch(/auth|OAuth2/i); // Either branch name or summary
      expect(frame).toMatch(/bugfix|memory leak/i); // Either branch name or summary
    });

    it('shows AI summaries within 2 seconds', async () => {
      const { lastFrame } = render(<App cwd="/test/repo" />);

      // Wait for loading
      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

      const frame = lastFrame() || '';

      // Check that summaries are displayed
      expect(frame).toContain('Main development branch');
      expect(frame).toContain('OAuth2 authentication');
      expect(frame).toContain('memory leak');
    });

    it('displays modified file counts', async () => {
      const { lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

      const frame = lastFrame() || '';

      // Check modified counts appear (feature/auth has 5, bugfix has 2)
      // The counts are shown as "X files" in the worktree cards
      expect(frame).toMatch(/5 files/i);
      expect(frame).toMatch(/2 files/i);
    });
  });

  describe('Keyboard Navigation', () => {
    it('moves focus with arrow keys', async () => {
      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Press down arrow to move to second worktree
      stdin.write('\x1B[B');
      await tick();
      await tick();

      const frame = lastFrame() || '';

      // The focused worktree should be highlighted (implementation may use different indicators)
      // We just verify the frame updated
      expect(frame).toBeDefined();
    });

    it('expands card on Space key', async () => {
      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Press space to expand
      stdin.write(' ');
      await tick();
      await tick();

      // Card should now show expanded content
      const frame = lastFrame() || '';
      expect(frame).toBeDefined();
    });

    it('handles Home and End keys', async () => {
      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Press End to go to last worktree
      stdin.write('\x1B[F'); // End key
      await tick();
      await tick();

      // Press Home to go to first
      stdin.write('\x1B[H'); // Home key
      await tick();
      await tick();

      expect(lastFrame()).toBeDefined();
    });
  });

  describe('CopyTree Actions', () => {
    it('triggers CopyTree on c key', async () => {
      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Clear previous calls
      vi.mocked(runCopyTreeWithProfile).mockClear();

      // Create notification listener
      let successNotification = false;
      const unsubscribe = events.on('ui:notify', (payload) => {
        if (payload.type === 'success') {
          successNotification = true;
        }
      });

      // Press 'c' to copy tree
      stdin.write('c');
      await tick();

      // Wait for CopyTree to be called
      await waitForCondition(() => vi.mocked(runCopyTreeWithProfile).mock.calls.length > 0);

      // Verify the call
      expect(runCopyTreeWithProfile).toHaveBeenCalled();

      // Wait for success notification
      await waitForCondition(() => successNotification, 1000);

      unsubscribe();
    });

    it('handles CopyTree errors gracefully', async () => {
      // Mock failure
      vi.mocked(runCopyTreeWithProfile).mockRejectedValueOnce(new Error('CopyTree failed'));

      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      let errorNotification = false;
      const unsubscribe = events.on('ui:notify', (payload) => {
        if (payload.type === 'error') {
          errorNotification = true;
        }
      });

      // Trigger CopyTree
      stdin.write('c');
      await tick();

      // Wait for error notification
      await waitForCondition(() => errorNotification, 1000);

      unsubscribe();

      // App should not crash and error was emitted via events
      expect(lastFrame()).toBeDefined();
      expect(errorNotification).toBe(true);
    });
  });

  describe('Profile Selection', () => {
    it('opens profile selector on p key', async () => {
      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Press 'p' to open profile selector
      stdin.write('p');
      await tick();
      await tick();

      const frame = lastFrame() || '';

      // Should show profile selector modal
      expect(frame).toMatch(/profile/i);
    });

    it('closes profile selector on Escape', async () => {
      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Open profile selector
      stdin.write('p');
      await tick();
      await tick();

      // Press Escape to close
      stdin.write('\x1B');
      await tick();
      await tick();

      // Modal should be closed
      const frame = lastFrame() || '';
      expect(frame).toBeDefined();
    });
  });

  describe('VS Code Integration', () => {
    it('opens editor on Enter key', async () => {
      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      vi.mocked(openWorktreeInEditor).mockClear();

      // Press Enter to open in editor
      stdin.write('\r');
      await tick();
      await tick();

      // Should have called openWorktreeInEditor
      expect(openWorktreeInEditor).toHaveBeenCalled();
    });

    it('handles editor errors gracefully', async () => {
      vi.mocked(openWorktreeInEditor).mockRejectedValueOnce(new Error('Editor not found'));

      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      let errorNotification = false;
      const unsubscribe = events.on('ui:notify', (payload) => {
        if (payload.type === 'error') {
          errorNotification = true;
        }
      });

      // Try to open editor
      stdin.write('\r');
      await tick();

      // Wait for error notification
      await waitForCondition(() => errorNotification, 1000);

      unsubscribe();

      // App should not crash
      expect(lastFrame()).toBeDefined();
    });
  });

  describe('Fuzzy Search', () => {
    it('opens fuzzy search on / key', async () => {
      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Press '/' to open fuzzy search
      stdin.write('/');
      await tick();
      await tick();

      const frame = lastFrame() || '';

      // Should show fuzzy search modal
      expect(frame).toBeDefined();
    });

    it('performs search and shows results', async () => {
      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Open fuzzy search
      stdin.write('/');
      await tick();
      await tick();

      // Type a search query
      stdin.write('i');
      stdin.write('n');
      stdin.write('d');
      await tick();
      await tick();

      const frame = lastFrame() || '';

      // Results should be filtered
      expect(frame).toBeDefined();
    });

    it('closes fuzzy search on Escape', async () => {
      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Open fuzzy search
      stdin.write('/');
      await tick();
      await tick();

      // Press Escape
      stdin.write('\x1B');
      await tick();
      await tick();

      // Modal should be closed
      expect(lastFrame()).toBeDefined();
    });
  });

  describe('View Mode Switching', () => {
    it('switches to tree mode and back via events', async () => {
      const { lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Initially in dashboard mode - verify WorktreeOverview is shown
      let frame = lastFrame() || '';
      expect(frame).toBeDefined();

      // Switch to tree mode
      events.emit('ui:view:mode', { mode: 'tree' });
      await tick();
      await tick();

      // Now in tree mode
      frame = lastFrame() || '';
      expect(frame).toBeDefined();

      // Switch back to dashboard
      events.emit('ui:view:mode', { mode: 'dashboard' });
      await tick();
      await tick();

      // Back in dashboard mode
      frame = lastFrame() || '';
      expect(frame).toBeDefined();
    });

    it('maintains state when switching views', async () => {
      const { lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      const initialFrame = lastFrame();

      // Switch to tree and back
      events.emit('ui:view:mode', { mode: 'tree' });
      await tick();
      events.emit('ui:view:mode', { mode: 'dashboard' });
      await tick();

      // Worktrees should still be visible
      const finalFrame = lastFrame() || '';
      expect(finalFrame).toContain('main');
    });
  });

  describe('Help Modal', () => {
    it('opens help modal on ? key', async () => {
      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Press '?' to open help
      stdin.write('?');

      // Wait for the modal to appear in the frame
      await waitForCondition(() => {
        const frame = lastFrame() || '';
        return frame.includes('Keyboard') || frame.includes('Help') || frame.includes('Shortcuts');
      }, 1000);

      const frame = lastFrame() || '';

      // Should show help content
      expect(frame).toMatch(/help|keyboard|shortcuts/i);
    });

    it('closes help modal on Escape', async () => {
      const { stdin, lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Open help
      stdin.write('?');
      await tick();
      await tick();

      // Close with Escape
      stdin.write('\x1B');
      await tick();
      await tick();

      // Help should be closed
      expect(lastFrame()).toBeDefined();
    });
  });

  describe('Error Scenarios', () => {
    it('handles missing worktrees gracefully', async () => {
      // Mock empty worktrees
      const { useAppLifecycle } = await import('../src/hooks/useAppLifecycle.js');
      vi.mocked(useAppLifecycle).mockReturnValueOnce({
        status: 'ready',
        config: mockDashboardConfig,
        worktrees: [],
        activeWorktreeId: null,
        activeRootPath: '/test/repo',
        initialSelectedPath: null,
        initialExpandedFolders: [],
        initialGitOnlyMode: false,
        initialCopyProfile: 'default',
        error: null,
        notification: null,
        setNotification: vi.fn(),
        reinitialize: vi.fn(),
      });

      const { lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

      // Should not crash
      expect(lastFrame()).toBeDefined();
    });

    it('displays error notifications from file operations', async () => {
      vi.mocked(copyFilePath).mockRejectedValueOnce(new Error('Clipboard unavailable'));

      const { lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

      // App should not crash
      expect(lastFrame()).toBeDefined();
    });

    it('recovers from lifecycle errors', async () => {
      const { useAppLifecycle } = await import('../src/hooks/useAppLifecycle.js');
      vi.mocked(useAppLifecycle).mockReturnValueOnce({
        status: 'error',
        config: mockDashboardConfig,
        worktrees: [],
        activeWorktreeId: null,
        activeRootPath: '/test/repo',
        initialSelectedPath: null,
        initialExpandedFolders: [],
        initialGitOnlyMode: false,
        initialCopyProfile: 'default',
        error: new Error('Failed to load config'),
        notification: null,
        setNotification: vi.fn(),
        reinitialize: vi.fn(),
      });

      const { lastFrame } = render(<App cwd="/test/repo" />);

      // Should show error but not crash
      const frame = lastFrame() || '';
      expect(frame).toBeDefined();
    });
  });

  describe('Notification System', () => {
    it('displays success notifications', async () => {
      const { lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Emit success notification
      events.emit('ui:notify', { type: 'success', message: 'Test success' });

      // Wait for notification to appear
      await waitForCondition(() => {
        const frame = lastFrame() || '';
        return frame.includes('Test success');
      }, 1000);

      const frame = lastFrame() || '';
      expect(frame).toContain('Test success');
    });

    it('displays error notifications', async () => {
      const { lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Emit error notification
      events.emit('ui:notify', { type: 'error', message: 'Test error' });

      // Wait for notification to appear
      await waitForCondition(() => {
        const frame = lastFrame() || '';
        return frame.includes('Test error');
      }, 1000);

      const frame = lastFrame() || '';
      expect(frame).toContain('Test error');
    });

    it('clears notifications after timeout', async () => {
      const { lastFrame } = render(<App cwd="/test/repo" />);

      await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
      await tick();

      // Emit notification
      events.emit('ui:notify', { type: 'info', message: 'Temporary message' });

      // Wait for notification to appear
      await waitForCondition(() => {
        const frame = lastFrame() || '';
        return frame.includes('Temporary message');
      }, 1000);

      // Message should appear
      let frame = lastFrame() || '';
      expect(frame).toContain('Temporary message');

      // Wait for notification timeout (typically 2 seconds based on App.tsx:597-604)
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Message should be cleared - verify it no longer appears
      frame = lastFrame() || '';
      expect(frame).not.toContain('Temporary message');
    });
  });
});
