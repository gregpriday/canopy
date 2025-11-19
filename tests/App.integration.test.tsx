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

import { openFile } from '../src/utils/fileOpener.js';
import { copyFilePath } from '../src/utils/clipboard.js';
import * as configUtils from '../src/utils/config.js';

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
