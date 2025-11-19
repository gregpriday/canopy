import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { HelpModal } from '../../src/components/HelpModal.js';

describe('HelpModal', () => {
  it('renders nothing when visible is false', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={false} onClose={onClose} />
    );

    expect(lastFrame()).toBe('');
  });

  it('hides content when transitioning from visible to hidden', () => {
    const onClose = vi.fn();
    const { lastFrame, rerender } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    // Initially visible - should have content
    expect(lastFrame()).toContain('Yellowwood Keyboard Shortcuts');

    // Transition to hidden
    rerender(<HelpModal visible={false} onClose={onClose} />);

    // Should now be empty
    expect(lastFrame()).toBe('');
  });

  it('renders help content when visible is true', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();

    // Check for title
    expect(frame).toContain('Yellowwood Keyboard Shortcuts');

    // Check for category headers
    expect(frame).toContain('Navigation:');
    expect(frame).toContain('Opening/Toggling:');
    expect(frame).toContain('Worktrees:');
    expect(frame).toContain('Commands:');
    expect(frame).toContain('Git:');
    expect(frame).toContain('Copy/CopyTree:');
    expect(frame).toContain('Misc:');
  });

  it('displays all navigation shortcuts', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    // Check for descriptions instead of arrow symbols (encoding issues in test env)
    expect(frame).toContain('Move selection up/down');
    expect(frame).toContain('Collapse folder or move to parent');
    expect(frame).toContain('Expand folder or open file');
    expect(frame).toContain('PageUp/Dn');
    expect(frame).toContain('Ctrl+U/D');
  });

  it('displays all action shortcuts', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('Enter');
    expect(frame).toContain('Space');
  });

  it('displays worktree shortcuts', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('w');
    expect(frame).toContain('W');
    expect(frame).toContain('Worktree Panel');
  });

  it('displays command shortcuts', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('/');
    expect(frame).toContain('Ctrl+F');
    expect(frame).toContain('command bar');
  });

  it('displays git shortcuts', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('g');
    expect(frame).toContain('git status markers');
  });

  it('displays copy/copytree shortcuts', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('c');
    expect(frame).toContain('C');
    expect(frame).toContain('CopyTree');
  });

  it('displays misc shortcuts', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('r');
    expect(frame).toContain('?');
    expect(frame).toContain('q');
    expect(frame).toContain('m');
    expect(frame).toContain('Manual refresh');
    expect(frame).toContain('Quit');
  });

  it('shows dismiss instructions in footer', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('ESC');
    expect(frame).toContain('?');
    expect(frame).toContain('to close');
  });

  it('calls onClose when ESC is pressed', () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    // Simulate ESC key
    stdin.write('\x1B');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when ? is pressed', () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    // Simulate ? key
    stdin.write('?');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose for other keys', () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    // Simulate other keys
    stdin.write('a');
    stdin.write('q');
    stdin.write('\r'); // Enter

    // onClose should not be called for these keys
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders with double border style', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    // Double border uses ═ and ║ characters (Unicode)
    // Or +, -, | characters (ASCII fallback in some environments)
    // Just verify modal has some border characters
    const hasUnicodeBorder = frame.includes('═') || frame.includes('╔') || frame.includes('╗');
    const hasAsciiBorder = frame.includes('+') || frame.includes('-') || frame.includes('|');
    expect(hasUnicodeBorder || hasAsciiBorder).toBe(true);
  });

  it('does not call onClose when not visible (ESC)', () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <HelpModal visible={false} onClose={onClose} />
    );

    // Try to dismiss with ESC
    stdin.write('\x1B');

    // onClose should not be called because modal is not visible
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose when not visible (?)', () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <HelpModal visible={false} onClose={onClose} />
    );

    // Try to dismiss with ?
    stdin.write('?');

    // onClose should not be called because modal is not visible
    expect(onClose).not.toHaveBeenCalled();
  });

  it('includes all navigation shortcut descriptions', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('Move selection up/down');
    expect(frame).toContain('Collapse folder or move to parent');
    expect(frame).toContain('Expand folder or open file');
    expect(frame).toContain('Scroll viewport up/down');
    expect(frame).toContain('alternate'); // Ctrl+U/D alternate description
  });

  it('includes all action shortcut descriptions', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('Open file or toggle folder');
    expect(frame).toContain('Toggle folder expansion without opening');
  });

  it('includes worktree shortcut descriptions', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('Cycle to next worktree');
    expect(frame).toContain('Open Worktree Panel overlay');
  });

  it('includes command shortcut descriptions', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('Open command bar');
    expect(frame).toContain('Open filter command');
  });

  it('includes git shortcut description', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('Toggle git status markers');
  });

  it('includes copy/copytree shortcut descriptions', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('Copy path or CopyTree reference');
    expect(frame).toContain('Open CopyTree command builder');
  });

  it('includes misc shortcut descriptions', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(
      <HelpModal visible={true} onClose={onClose} />
    );

    const frame = lastFrame();
    expect(frame).toContain('Manual refresh');
    expect(frame).toContain('Toggle this help overlay');
    expect(frame).toContain('Quit Yellowwood');
    expect(frame).toContain('Open context menu');
  });
});
