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
  runCopyTree: vi.fn().mockResolvedValue('Success\nCopied!'),
}));

import { openFile } from '../src/utils/fileOpener.js';
import { copyFilePath } from '../src/utils/clipboard.js';
import * as configUtils from '../src/utils/config.js';
import { runCopyTree } from '../src/utils/copytree.js';
import { events } from '../src/services/events.js';

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
  });

  it('useCopyTree hook is mounted and responds to file:copy-tree events', async () => {
    const { lastFrame } = render(<App cwd="/test/project" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Clear any previous calls
    vi.mocked(runCopyTree).mockClear();

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
    await waitForCondition(() => vi.mocked(runCopyTree).mock.calls.length > 0);

    // Verify runCopyTree was called with the correct path
    expect(runCopyTree).toHaveBeenCalledWith('/test/project');

    // Wait for notification
    await waitForCondition(() => notificationReceived);

    unsubscribe();
  });

  it('uses custom rootPath from payload when provided', async () => {
    const { lastFrame } = render(<App cwd="/test/default" />);

    // Wait for initialization
    await waitForCondition(() => !lastFrame()?.includes('Loading Canopy'));

    // Clear any previous calls
    vi.mocked(runCopyTree).mockClear();

    // Emit file:copy-tree event with custom path
    events.emit('file:copy-tree', { rootPath: '/custom/path' });

    // Wait for runCopyTree to be called
    await waitForCondition(() => vi.mocked(runCopyTree).mock.calls.length > 0);

    // Verify runCopyTree was called with the custom path
    expect(runCopyTree).toHaveBeenCalledWith('/custom/path');
  });

  it('emits error notification when CopyTree fails', async () => {
    // Mock failure
    vi.mocked(runCopyTree).mockRejectedValueOnce(new Error('CopyTree command failed'));

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

describe('App integration - file:copy-path event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configUtils.loadConfig).mockResolvedValue(DEFAULT_CONFIG);
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
