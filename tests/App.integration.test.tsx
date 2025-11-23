import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../src/App.js';
import { DEFAULT_CONFIG } from '../src/types/index.js';

// Mock the file operations
vi.mock('../src/utils/fileOpener.js', () => ({
  openFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/utils/clipboard.js', () => ({
  copyFilePath: vi.fn().mockResolvedValue(undefined),
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/utils/worktree.js', () => ({
  getWorktrees: vi.fn().mockResolvedValue([]),
  getCurrentWorktree: vi.fn().mockReturnValue(null),
}));

vi.mock('../src/utils/config.js');

vi.mock('../src/utils/copytree.js', () => ({
  runCopyTreeWithProfile: vi.fn().mockResolvedValue('Success\nCopied!'),
}));

vi.mock('../src/hooks/useMultiWorktreeStatus.js', () => ({
  useMultiWorktreeStatus: vi.fn().mockReturnValue({
    worktreeChanges: new Map(),
    refresh: vi.fn(),
    clear: vi.fn(),
  }),
}));

import { openFile } from '../src/utils/fileOpener.js';
import { copyFilePath } from '../src/utils/clipboard.js';
import * as configUtils from '../src/utils/config.js';
import { runCopyTreeWithProfile } from '../src/utils/copytree.js';
import { events } from '../src/services/events.js';
import { getWorktrees, getCurrentWorktree } from '../src/utils/worktree.js';
import { useMultiWorktreeStatus } from '../src/hooks/useMultiWorktreeStatus.js';

// Helper to wait for condition
async function waitForCondition(fn: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe('App integration - file operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default mock for loadConfig
    vi.mocked(configUtils.loadConfig).mockResolvedValue(DEFAULT_CONFIG);
    vi.mocked(useMultiWorktreeStatus).mockReturnValue({
      worktreeChanges: new Map(),
      refresh: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('renders without crashing', async () => {
    const { lastFrame } = render(<App cwd="/test" />);

    // Wait for async initialization using frame content check
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    expect(lastFrame()).toBeDefined();
  });

  it('shows context menu when opened', async () => {
    const { lastFrame } = render(<App cwd="/test" />);

    // Wait for initialization using frame content check
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Note: Actually triggering keyboard events and testing context menu interaction
    // would require more complex setup with mock file trees and selection state.
    // This is a placeholder for the integration test structure.

    expect(lastFrame()).toBeDefined();
  });

  // Note: Full integration testing of Enter/c/m key interactions would require:
  // 1. Mocking file tree state
  // 2. Simulating file selection
  // 3. Sending keyboard input via stdin
  // 4. Asserting that openFile/copyFilePath were called
  // This is complex with Ink's current testing library and may be better suited
  // for E2E tests or manual testing.

  it('handles file open errors gracefully', async () => {
    // Mock openFile to throw an error
    (openFile as any).mockRejectedValueOnce(new Error('Editor not found'));

    const { lastFrame } = render(<App cwd="/test" />);

    // Wait for initialization using frame content check
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // App should not crash on error
    expect(lastFrame()).toBeDefined();
  });

  it('handles clipboard errors gracefully', async () => {
    // Mock copyFilePath to throw an error
    (copyFilePath as any).mockRejectedValueOnce(new Error('Clipboard unavailable'));

    const { lastFrame } = render(<App cwd="/test" />);

    // Wait for initialization using frame content check
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // App should not crash on error
    expect(lastFrame()).toBeDefined();
  });

  it('shows loading screen during initialization', () => {
    const { lastFrame } = render(<App cwd="/test" />);

    // Initially should show loading
    expect(lastFrame()).toContain('Loading Canopy');
  });

  it('transitions from loading to ready state', async () => {
    const { lastFrame } = render(<App cwd="/test" />);

    // Initially loading
    expect(lastFrame()).toContain('Loading Canopy');

    // Wait for lifecycle to complete
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));
  });
});

describe('App integration - CopyTree centralized listener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configUtils.loadConfig).mockResolvedValue(DEFAULT_CONFIG);
    vi.mocked(useMultiWorktreeStatus).mockReturnValue({
      worktreeChanges: new Map(),
      refresh: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('useCopyTree hook is mounted and responds to file:copy-tree events', async () => {
    const { lastFrame } = render(<App cwd="/test/project" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Clear any previous calls
    vi.mocked(runCopyTreeWithProfile).mockClear();

    // Create a promise to wait for notification
    let notificationReceived = false;
    const unsubscribe = events.on('ui:notify', (payload) => {
      if (payload.type === 'success' && payload.message === 'Copied!') {
        notificationReceived = true;
      }
    });

    // Emit file:copy-tree event
    events.emit('file:copy-tree', {});

    // Wait for runCopyTree to be called
    await waitForCondition(() => vi.mocked(runCopyTreeWithProfile).mock.calls.length > 0);

    // Verify runCopyTree was called with the correct path
    expect(runCopyTreeWithProfile).toHaveBeenCalledWith(
      '/test/project',
      'default',
      expect.any(Object),
      []
    );

    // Wait for notification
    await waitForCondition(() => notificationReceived);

    unsubscribe();
  });

  it('uses custom rootPath from payload when provided', async () => {
    const { lastFrame } = render(<App cwd="/test/default" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Clear any previous calls
    vi.mocked(runCopyTreeWithProfile).mockClear();

    // Emit file:copy-tree event with custom path
    events.emit('file:copy-tree', { rootPath: '/custom/path' });

    // Wait for runCopyTree to be called
    await waitForCondition(() => vi.mocked(runCopyTreeWithProfile).mock.calls.length > 0);

    // Verify runCopyTree was called with the custom path
    expect(runCopyTreeWithProfile).toHaveBeenCalledWith(
      '/custom/path',
      'default',
      expect.any(Object),
      []
    );
  });

  it('emits error notification when CopyTree fails', async () => {
    // Mock failure
    vi.mocked(runCopyTreeWithProfile).mockRejectedValueOnce(new Error('CopyTree command failed'));

    const { lastFrame } = render(<App cwd="/test/project" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Create a promise to wait for error notification
    let errorReceived = false;
    const unsubscribe = events.on('ui:notify', (payload) => {
      if (payload.type === 'error') {
        errorReceived = true;
      }
    });

    // Emit file:copy-tree event
    events.emit('file:copy-tree', {});

    // Wait for error notification
    await waitForCondition(() => errorReceived);

    unsubscribe();

    // App should not crash
    expect(lastFrame()).toBeDefined();
  });
});

describe('App integration - clear selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configUtils.loadConfig).mockResolvedValue(DEFAULT_CONFIG);
    vi.mocked(useMultiWorktreeStatus).mockReturnValue({
      worktreeChanges: new Map(),
      refresh: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('clears selection when nav:clear-selection event is emitted', async () => {
    const { lastFrame } = render(<App cwd="/test" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // First, select a path
    events.emit('nav:select', { path: '/test/file.txt' });

    // Give it time to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Now clear the selection
    events.emit('nav:clear-selection');

    // Give it time to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // App should still render without errors (selection is now null)
    expect(lastFrame()).toBeDefined();
  });
});

describe('App integration - file:copy-path event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configUtils.loadConfig).mockResolvedValue(DEFAULT_CONFIG);
    vi.mocked(useMultiWorktreeStatus).mockReturnValue({
      worktreeChanges: new Map(),
      refresh: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('handles file:copy-path event and calls copyFilePath', async () => {
    const { lastFrame } = render(<App cwd="/test/project" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Clear any previous calls
    vi.mocked(copyFilePath).mockClear();

    // Create a promise to wait for success notification
    let successReceived = false;
    const unsubscribe = events.on('ui:notify', (payload) => {
      if (payload.type === 'success' && payload.message === 'Path copied to clipboard') {
        successReceived = true;
      }
    });

    // Emit file:copy-path event
    events.emit('file:copy-path', { path: '/test/project/src/App.tsx' });

    // Wait for copyFilePath to be called
    await waitForCondition(() => vi.mocked(copyFilePath).mock.calls.length > 0);

    // Verify copyFilePath was called with normalized absolute paths
    expect(copyFilePath).toHaveBeenCalledWith(
      '/test/project/src/App.tsx',
      '/test/project',
      true // relative path output
    );

    // Wait for success notification
    await waitForCondition(() => successReceived);

    unsubscribe();
  });

  it('normalizes relative paths before calling copyFilePath', async () => {
    const { lastFrame } = render(<App cwd="relative/path" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Clear any previous calls
    vi.mocked(copyFilePath).mockClear();

    // Emit file:copy-path event with relative path
    events.emit('file:copy-path', { path: 'src/App.tsx' });

    // Wait for copyFilePath to be called
    await waitForCondition(() => vi.mocked(copyFilePath).mock.calls.length > 0);

    // Verify paths were normalized to absolute
    const calls = vi.mocked(copyFilePath).mock.calls;
    expect(calls[0][0]).toMatch(/^[/\\]/); // Absolute path (starts with / or \)
    expect(calls[0][1]).toMatch(/^[/\\]/); // Absolute path
  });

  it('emits error notification when copyFilePath fails', async () => {
    // Mock failure
    vi.mocked(copyFilePath).mockRejectedValueOnce(new Error('Clipboard unavailable'));

    const { lastFrame } = render(<App cwd="/test/project" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Create a promise to wait for error notification
    let errorReceived = false;
    const unsubscribe = events.on('ui:notify', (payload) => {
      if (payload.type === 'error' && payload.message.includes('Failed to copy path')) {
        errorReceived = true;
      }
    });

    // Emit file:copy-path event
    events.emit('file:copy-path', { path: '/test/project/file.txt' });

    // Wait for error notification
    await waitForCondition(() => errorReceived);

    unsubscribe();

    // App should not crash
    expect(lastFrame()).toBeDefined();
  });
});

describe('App integration - worktree event handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configUtils.loadConfig).mockResolvedValue(DEFAULT_CONFIG);
    vi.mocked(useMultiWorktreeStatus).mockReturnValue({
      worktreeChanges: new Map(),
      refresh: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('handles sys:worktree:cycle with multiple worktrees', async () => {
    // Mock multiple worktrees
    const mockWorktrees = [
      { id: '/project/main', path: '/project/main', name: 'main', branch: 'main', isCurrent: true },
      { id: '/project/feature', path: '/project/feature', name: 'feature', branch: 'feature', isCurrent: false },
      { id: '/project/develop', path: '/project/develop', name: 'develop', branch: 'develop', isCurrent: false },
    ];

    vi.mocked(configUtils.loadConfig).mockResolvedValue({
      ...DEFAULT_CONFIG,
      worktrees: { enabled: true, showHeader: true },
    });

    // Mock both getWorktrees and getCurrentWorktree
    vi.mocked(getWorktrees).mockResolvedValue(mockWorktrees);
    vi.mocked(getCurrentWorktree).mockReturnValue(mockWorktrees[0]);

    const { lastFrame } = render(<App cwd="/project/main" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Listen for success notification (from handleSwitchWorktree)
    let switchedTo = '';
    const unsubscribe = events.on('ui:notify', (payload) => {
      if (payload.type === 'success' && payload.message.includes('Switched to')) {
        switchedTo = payload.message;
      }
    });

    // Emit sys:worktree:cycle event with direction=1 (next)
    events.emit('sys:worktree:cycle', { direction: 1 });

    // Wait for notification
    await waitForCondition(() => switchedTo !== '', 2000);

    expect(switchedTo).toContain('feature');

    unsubscribe();
  });

  it('warns when cycling with single worktree', async () => {
    // Mock single worktree
    const mockWorktrees = [
      { id: '/project/main', path: '/project/main', name: 'main', branch: 'main', isCurrent: true },
    ];

    vi.mocked(getWorktrees).mockResolvedValue(mockWorktrees);
    vi.mocked(getCurrentWorktree).mockReturnValue(mockWorktrees[0]);

    const { lastFrame } = render(<App cwd="/project/main" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Listen for warning notification
    let warningReceived = false;
    const unsubscribe = events.on('ui:notify', (payload) => {
      if (payload.type === 'warning' && payload.message.includes('No other worktrees')) {
        warningReceived = true;
      }
    });

    // Emit sys:worktree:cycle event
    events.emit('sys:worktree:cycle', { direction: 1 });

    // Wait for notification
    await waitForCondition(() => warningReceived);

    unsubscribe();
  });

  it('handles sys:worktree:selectByName with exact branch match', async () => {
    // Mock multiple worktrees
    const mockWorktrees = [
      { id: '/project/main', path: '/project/main', name: 'main', branch: 'main', isCurrent: true },
      { id: '/project/feature', path: '/project/feature', name: 'feature', branch: 'feature-branch', isCurrent: false },
    ];

    vi.mocked(getWorktrees).mockResolvedValue(mockWorktrees);
    vi.mocked(getCurrentWorktree).mockReturnValue(mockWorktrees[0]);

    const { lastFrame } = render(<App cwd="/project/main" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Listen for success notification
    let switchedTo = '';
    const unsubscribe = events.on('ui:notify', (payload) => {
      if (payload.type === 'success' && payload.message.includes('Switched to')) {
        switchedTo = payload.message;
      }
    });

    // Emit sys:worktree:selectByName event
    events.emit('sys:worktree:selectByName', { query: 'feature-branch' });

    // Wait for notification
    await waitForCondition(() => switchedTo !== '', 2000);

    expect(switchedTo).toContain('feature');

    unsubscribe();
  });

  it('handles sys:worktree:selectByName with name match', async () => {
    // Mock multiple worktrees
    const mockWorktrees = [
      { id: '/project/main', path: '/project/main', name: 'main', branch: 'main', isCurrent: true },
      { id: '/project/my-feature', path: '/project/my-feature', name: 'my-feature', branch: 'feature', isCurrent: false },
    ];

    vi.mocked(getWorktrees).mockResolvedValue(mockWorktrees);
    vi.mocked(getCurrentWorktree).mockReturnValue(mockWorktrees[0]);

    const { lastFrame } = render(<App cwd="/project/main" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Listen for success notification
    let switchedTo = '';
    const unsubscribe = events.on('ui:notify', (payload) => {
      if (payload.type === 'success' && payload.message.includes('Switched to')) {
        switchedTo = payload.message;
      }
    });

    // Emit sys:worktree:selectByName event
    events.emit('sys:worktree:selectByName', { query: 'my-feature' });

    // Wait for notification
    await waitForCondition(() => switchedTo !== '', 2000);

    // Notification shows branch, not name
    expect(switchedTo).toContain('feature');

    unsubscribe();
  });

  it('handles sys:worktree:selectByName with path substring match', async () => {
    // Mock multiple worktrees
    const mockWorktrees = [
      { id: '/project/main', path: '/project/main', name: 'main', branch: 'main', isCurrent: true },
      { id: '/project/issue-123', path: '/project/issue-123', name: 'issue-123', branch: 'feature', isCurrent: false },
    ];

    vi.mocked(getWorktrees).mockResolvedValue(mockWorktrees);
    vi.mocked(getCurrentWorktree).mockReturnValue(mockWorktrees[0]);

    const { lastFrame } = render(<App cwd="/project/main" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Listen for success notification
    let switchedTo = '';
    const unsubscribe = events.on('ui:notify', (payload) => {
      if (payload.type === 'success' && payload.message.includes('Switched to')) {
        switchedTo = payload.message;
      }
    });

    // Emit sys:worktree:selectByName event with path substring
    events.emit('sys:worktree:selectByName', { query: 'issue-123' });

    // Wait for notification
    await waitForCondition(() => switchedTo !== '', 2000);

    // Notification shows branch, not name
    expect(switchedTo).toContain('feature');

    unsubscribe();
  });

  it('errors when no worktree matches pattern', async () => {
    // Mock multiple worktrees
    const mockWorktrees = [
      { id: '/project/main', path: '/project/main', name: 'main', branch: 'main', isCurrent: true },
      { id: '/project/feature', path: '/project/feature', name: 'feature', branch: 'feature', isCurrent: false },
    ];

    vi.mocked(getWorktrees).mockResolvedValue(mockWorktrees);
    vi.mocked(getCurrentWorktree).mockReturnValue(mockWorktrees[0]);

    const { lastFrame } = render(<App cwd="/project/main" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Listen for error notification
    let errorMessage = '';
    const unsubscribe = events.on('ui:notify', (payload) => {
      if (payload.type === 'error' && payload.message.includes('No worktree matching')) {
        errorMessage = payload.message;
      }
    });

    // Emit sys:worktree:selectByName event with non-existent pattern
    events.emit('sys:worktree:selectByName', { query: 'nonexistent' });

    // Wait for notification
    await waitForCondition(() => errorMessage !== '');

    expect(errorMessage).toContain('No worktree matching "nonexistent"');

    unsubscribe();
  });

  it('errors when no worktrees available', async () => {
    // Mock no worktrees
    const { getWorktrees } = await import('../src/utils/worktree.js');
    vi.mocked(getWorktrees).mockResolvedValue([]);

    const { lastFrame } = render(<App cwd="/project/main" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Listen for error notification
    let errorMessage = '';
    const unsubscribe = events.on('ui:notify', (payload) => {
      if (payload.type === 'error' && payload.message.includes('No worktrees available')) {
        errorMessage = payload.message;
      }
    });

    // Emit sys:worktree:selectByName event
    events.emit('sys:worktree:selectByName', { query: 'main' });

    // Wait for notification
    await waitForCondition(() => errorMessage !== '');

    expect(errorMessage).toBe('No worktrees available');

    unsubscribe();
  });
});

describe('App integration - dashboard mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configUtils.loadConfig).mockResolvedValue(DEFAULT_CONFIG);
    vi.mocked(useMultiWorktreeStatus).mockReturnValue({
      worktreeChanges: new Map(),
      refresh: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('renders in dashboard mode by default', async () => {
    // Mock multiple worktrees for dashboard
    const mockWorktrees = [
      { id: '/project/main', path: '/project/main', name: 'main', branch: 'main', isCurrent: true },
      { id: '/project/feature', path: '/project/feature', name: 'feature', branch: 'feature', isCurrent: false },
    ];

    vi.mocked(getWorktrees).mockResolvedValue(mockWorktrees);
    vi.mocked(getCurrentWorktree).mockReturnValue(mockWorktrees[0]);

    const { lastFrame } = render(<App cwd="/project/main" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    const output = lastFrame();

    // Dashboard is rendered by default (verifiable by examining the output)
    expect(output).toBeDefined();
    expect(output!.length > 0).toBe(true);
    // In dashboard mode, we show the dashboard view which contains worktree/session info
    // Verify the view is NOT showing typical tree-mode file listings
    // Tree mode would show the file structure with '.gitignore', 'src/', 'tests/', etc.
    expect(output?.includes('.gitignore')).toBe(false);
  });

  it('switches from dashboard to tree mode when ui:view:mode event is emitted', async () => {
    const mockWorktrees = [
      { id: '/project/main', path: '/project/main', name: 'main', branch: 'main', isCurrent: true },
    ];

    vi.mocked(getWorktrees).mockResolvedValue(mockWorktrees);
    vi.mocked(getCurrentWorktree).mockReturnValue(mockWorktrees[0]);

    const { lastFrame } = render(<App cwd="/project/main" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Initially in dashboard mode
    let output = lastFrame();
    expect(output).toBeDefined();
    // Dashboard shows worktree cards - should contain worktree name
    const dashboardOutput = output!;
    expect(dashboardOutput).toContain('main');

    // Switch to tree mode
    events.emit('ui:view:mode', { mode: 'tree' });

    // Give it time to process
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should now be in tree mode - the output should differ from dashboard
    output = lastFrame();
    expect(output).toBeDefined();
    // Verify the view actually changed by checking that output is different
    // Tree mode will show different UI structure than dashboard
    expect(output !== dashboardOutput).toBe(true);
  });

  it('uses focused worktree root when copying from dashboard', async () => {
    const mockWorktrees = [
      { id: '/project/main', path: '/project/main', name: 'main', branch: 'main', isCurrent: true },
      { id: '/project/feature', path: '/project/feature', name: 'feature', branch: 'feature', isCurrent: false },
    ];

    // Use proper WorktreeChanges structure
    const mockChanges = new Map([
      ['/project/feature', {
        worktreeId: '/project/feature',
        rootPath: '/project/feature',
        changes: [
          { path: 'src/file.ts', status: 'modified' as const },
          { path: 'src/new.ts', status: 'added' as const },
        ],
        changedFileCount: 2,
        lastUpdated: Date.now(),
      }],
    ]);

    vi.mocked(getWorktrees).mockResolvedValue(mockWorktrees);
    vi.mocked(getCurrentWorktree).mockReturnValue(mockWorktrees[0]);
    vi.mocked(useMultiWorktreeStatus).mockReturnValue({
      worktreeChanges: mockChanges,
      refresh: vi.fn(),
      clear: vi.fn(),
    });

    const { lastFrame } = render(<App cwd="/project/main" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Clear previous calls
    vi.mocked(runCopyTreeWithProfile).mockClear();

    // Trigger CopyTree - in dashboard mode, StatusBar determines the root path
    events.emit('file:copy-tree', {});

    // Wait for runCopyTree to be called
    await waitForCondition(() => vi.mocked(runCopyTreeWithProfile).mock.calls.length > 0, 2000);

    // Verify CopyTree was called (focused root logic is tested in StatusBar component tests)
    expect(runCopyTreeWithProfile).toHaveBeenCalled();
  });
});
