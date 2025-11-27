import React, { useLayoutEffect, useMemo, useState, useCallback, useEffect } from 'react';
import { Box, Text, measureElement } from 'ink';
import path from 'node:path';
import { homedir } from 'node:os';
import open from 'open';
import * as nf from '@m234/nerd-fonts';
import type { FileChangeDetail, GitStatus, Worktree, WorktreeChanges, WorktreeMood, DevServerState, AISummaryStatus } from '../types/index.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { ActivityTrafficLight } from './ActivityTrafficLight.js';

// Robot icon for AI agent files
const ROBOT_ICON = nf.icons['nf-md-robot'];

/**
 * Get file icon using @m234/nerd-fonts seti preset.
 * Special handling for AI agent files (CLAUDE.md, etc.)
 */
function getFileIcon(fileName: string): string {
  const lower = fileName.toLowerCase();

  // AI agent files get robot icon
  if (lower.endsWith('.md')) {
    if (lower.includes('agent') || lower.includes('claude') || lower.includes('gemini') || lower.includes('gpt') || lower.includes('copilot')) {
      return ROBOT_ICON?.value ?? '';
    }
  }

  // Use seti preset for everything else
  return nf.fromPath(fileName, 'seti').value;
}

// Maximum number of files to show in the card
const MAX_VISIBLE_FILES = 4;
// Maximum number of additional filenames to show in the "and X more" line
const MAX_ADDITIONAL_NAMES = 2;

const STATUS_PRIORITY: Record<GitStatus, number> = {
  modified: 0,
  added: 1,
  deleted: 2,
  renamed: 3,
  untracked: 4,
  ignored: 5,
};

// Git status colors follow standard conventions:
// - Green: added (new files)
// - Yellow/Orange: modified (changes)
// - Red: deleted
// - Gray: untracked/ignored

// Box drawing characters
const BORDER = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
};

function truncateMiddle(value: string, maxLength = 42): string {
  if (value.length <= maxLength) return value;
  const half = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, half)}...${value.slice(-half)}`;
}

function formatPath(targetPath: string): string {
  const home = homedir();
  if (targetPath.startsWith(home)) {
    return targetPath.replace(home, '~');
  }
  return targetPath;
}

function formatRelativePath(targetPath: string, rootPath: string): string {
  try {
    const home = homedir();
    let displayPath = path.isAbsolute(targetPath)
      ? path.relative(rootPath, targetPath)
      : targetPath;

    if (!displayPath) {
      displayPath = path.basename(targetPath);
    }

    if (displayPath.startsWith(home)) {
      displayPath = displayPath.replace(home, '~');
    }

    return displayPath;
  } catch {
    return targetPath;
  }
}

/**
 * Get display properties for per-card AI status badge.
 * Returns null for 'active' state to avoid visual noise when AI is working normally.
 */
function getPerCardAIStatus(status: AISummaryStatus | undefined): { label: string; color: string } | null {
  switch (status) {
    case 'active':
      return null;
    case 'loading':
      return null;
    case 'disabled':
      return { label: 'AI off', color: 'gray' };
    case 'error':
      return { label: 'AI err', color: 'red' };
    default:
      return null;
  }
}

// URL regex pattern - hoisted outside component to avoid re-creation
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/**
 * Parse text and return array of text and link segments.
 */
function parseNoteWithLinks(text: string): Array<{ type: 'text' | 'link'; content: string }> {
  const segments: Array<{ type: 'text' | 'link'; content: string }> = [];
  let lastIndex = 0;
  // Create a new regex instance to avoid state issues with global flag
  const regex = new RegExp(URL_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'link', content: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * Extract the first URL from text, if any.
 */
function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  return match ? match[0] : null;
}

/** TTL for notes on main worktree (10 minutes in milliseconds) */
const MAIN_WORKTREE_NOTE_TTL_MS = 10 * 60 * 1000;

export interface WorktreeCardProps {
  worktree: Worktree;
  changes: WorktreeChanges;
  mood: WorktreeMood;
  isFocused: boolean;
  activeRootPath: string;
  onCopyTree?: () => void;
  onOpenEditor?: () => void;
  onOpenIssue?: () => void;
  onOpenPR?: () => void;
  serverState?: DevServerState;
  hasDevScript?: boolean;
  onToggleServer?: () => void;
  aiNote?: string;
  /** Timestamp when the note file was last modified (milliseconds since epoch) */
  aiNoteTimestamp?: number;
  /** Whether this is the main worktree (main/master branch) - notes have 10-minute TTL */
  isMainWorktree?: boolean;
  registerClickRegion?: (
    id: string,
    bounds?: { x: number; y: number; width: number; height: number },
    handler?: () => void
  ) => void;
  /** Terminal width for border rendering */
  terminalWidth: number;
  /** Index of this card in the visible list - used to force click region re-registration on scroll */
  listIndex?: number;
}

// PERF: Memoized to prevent re-renders when other files in the list change
const FileChangeRow = React.memo<{
  change: FileChangeDetail;
  rootPath: string;
  accentColors: {
    added: string;
    deleted: string;
    modified: string;
    muted: string;
  };
  /** Width available for the row content */
  contentWidth: number;
}>(({ change, rootPath, accentColors, contentWidth }) => {
  const additionsLabel =
    change.insertions === null ? '' : `+${change.insertions}`;
  const deletionsLabel =
    change.deletions === null ? '' : `-${change.deletions}`;

  // Icon color based on git status
  const iconColor =
    change.status === 'added'
      ? accentColors.added
      : change.status === 'deleted'
      ? accentColors.deleted
      : change.status === 'untracked' || change.status === 'ignored'
      ? accentColors.muted
      : accentColors.modified;

  const relativePath = formatRelativePath(change.path, rootPath);
  const displayPath = truncateMiddle(relativePath, 46);
  const fileName = path.basename(change.path);
  const fileIcon = getFileIcon(fileName);

  return (
    <Box width={contentWidth} justifyContent="space-between">
      <Box>
        <Text color={iconColor}>{fileIcon} </Text>
        <Text>{displayPath}</Text>
      </Box>
      <Box gap={1}>
        {additionsLabel && <Text color={accentColors.added}>{additionsLabel}</Text>}
        {deletionsLabel && <Text color={accentColors.deleted}>{deletionsLabel}</Text>}
      </Box>
    </Box>
  );
});

// Action button component for top border
const BorderActionButton: React.FC<{
  id: string;
  label: string;
  color: string;
  borderColor: string;
  onPress?: () => void;
  registerRegion?: (
    id: string,
    bounds?: { x: number; y: number; width: number; height: number },
    handler?: () => void
  ) => void;
  /** Key that changes when layout might shift (e.g., when sibling buttons appear/disappear) */
  layoutKey?: string;
  /** Index of the card in the visible list - forces re-measurement when card moves due to scrolling */
  listIndex?: number;
  /** Terminal width - forces re-measurement when terminal is resized */
  terminalWidth?: number;
}> = ({ id, label, color, borderColor, onPress, registerRegion, layoutKey, listIndex, terminalWidth }) => {
  const ref = React.useRef<import('ink').DOMElement | null>(null);
  const [isPressed, setIsPressed] = useState(false);

  const handlePress = useCallback(() => {
    if (isPressed || !onPress) return;
    setIsPressed(true);
    onPress();
    setTimeout(() => setIsPressed(false), 150);
  }, [onPress, isPressed]);

  useLayoutEffect(() => {
    if (!registerRegion || !ref.current || !onPress) return;

    const measured = measureElement(ref.current) as { width: number; height: number };
    const yogaNode = ref.current.yogaNode;
    if (!yogaNode) return;

    const getAbsolutePosition = (node: any): { x: number; y: number } => {
      let x = 0;
      let y = 0;
      let current = node;
      while (current) {
        x += current.getComputedLeft?.() ?? 0;
        y += current.getComputedTop?.() ?? 0;
        current = current.getParent?.();
      }
      return { x, y };
    };

    const { x, y } = getAbsolutePosition(yogaNode);
    const bounds = { x, y, width: measured.width, height: measured.height };

    if (process.env.CANOPY_DEBUG_CLICK) {
      console.error(`[CLICK] Register: ${id} bounds=${JSON.stringify(bounds)} listIndex=${listIndex}`);
    }

    registerRegion(id, bounds, handlePress);
    return () => {
      if (process.env.CANOPY_DEBUG_CLICK) {
        console.error(`[CLICK] Deregister: ${id}`);
      }
      registerRegion(id, undefined, handlePress);
    };
  }, [registerRegion, id, onPress, handlePress, layoutKey, listIndex, terminalWidth]);

  // Button format: ─[ Label ] (no trailing ─, so adjacent buttons have single ─ between them)
  // The brackets and label are colored, the horizontal line matches border
  return (
    <Box
      ref={ref}
      // @ts-ignore - onClick exists but types don't expose it
      onClick={handlePress}
    >
      <Text color={borderColor}>{BORDER.horizontal}</Text>
      <Text color={isPressed ? 'black' : borderColor} backgroundColor={isPressed ? 'white' : undefined}>[</Text>
      <Text color={isPressed ? 'black' : color} backgroundColor={isPressed ? 'white' : undefined} bold> {label} </Text>
      <Text color={isPressed ? 'black' : borderColor} backgroundColor={isPressed ? 'white' : undefined}>]</Text>
    </Box>
  );
};

// PERF: Wrapped in React.memo to prevent unnecessary re-renders
const WorktreeCardInner: React.FC<WorktreeCardProps> = ({
  worktree,
  changes,
  mood,
  isFocused,
  activeRootPath,
  onCopyTree,
  onOpenEditor,
  onOpenIssue,
  onOpenPR,
  serverState,
  hasDevScript,
  onToggleServer,
  aiNote,
  aiNoteTimestamp,
  isMainWorktree,
  registerClickRegion,
  terminalWidth,
  listIndex,
}) => {
  const { palette } = useTheme();

  // Border color - use consistent color for all cards
  const borderColor = palette.text.tertiary;
  const headerColor = mood === 'active' ? palette.git.modified : palette.text.primary;

  // Calculate widths for the top border
  // Format: ╭─────────────────────────────────────────[ Copy ]─[ Code ]─[ Issue ]─[ PR ]─╮
  // Each button: ─[ Label ] = 1 + 1 + label.length + 2 + 1 = label.length + 5
  // Plus trailing ─ before ╮ = 1
  const copyButtonWidth = 4 + 5; // "Copy" = 4 chars + surrounding
  const codeButtonWidth = 4 + 5; // "Code" = 4 chars + surrounding
  const issueButtonWidth = worktree.issueNumber ? (5 + 5) : 0; // "Issue" = 5 chars + surrounding (only if issue detected)
  const prButtonWidth = worktree.prNumber ? (2 + 5) : 0; // "PR" = 2 chars + surrounding (only if PR detected)
  const trailingWidth = 1; // trailing ─ before ╮
  // Corner chars: 2 (╭ and ╮)
  // Total button area: copyButtonWidth + codeButtonWidth + issueButtonWidth + prButtonWidth + trailingWidth
  const buttonsWidth = copyButtonWidth + codeButtonWidth + issueButtonWidth + prButtonWidth + trailingWidth;
  const cornersWidth = 2;
  const lineWidth = Math.max(0, terminalWidth - buttonsWidth - cornersWidth);
  // Content width: terminal width minus borders (2) and padding (2)
  const contentWidth = terminalWidth - 4;

  // Clickable path handler - with error handling to prevent crashes
  const handlePathClick = useCallback(() => {
    open(worktree.path).catch(() => {
      // Silently ignore errors (missing opener, permission issues, etc.)
    });
  }, [worktree.path]);

  // Sort changes by priority and churn
  const sortedChanges = useMemo(() => {
    return [...changes.changes].sort((a, b) => {
      const priorityA = STATUS_PRIORITY[a.status] ?? 99;
      const priorityB = STATUS_PRIORITY[b.status] ?? 99;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const churnA = (a.insertions ?? 0) + (a.deletions ?? 0);
      const churnB = (b.insertions ?? 0) + (b.deletions ?? 0);
      if (churnA !== churnB) {
        return churnB - churnA;
      }

      return a.path.localeCompare(b.path);
    });
  }, [changes.changes]);

  // Show top 3 files
  const visibleChanges = sortedChanges.slice(0, MAX_VISIBLE_FILES);
  const remainingCount = Math.max(0, sortedChanges.length - MAX_VISIBLE_FILES);

  const hasChanges = changes.changedFileCount > 0;

  // Summary component
  let SummaryComponent: React.ReactNode;
  const isCommitMessage = worktree.summary?.startsWith('Last commit:') || worktree.summary?.startsWith('\u2705');

  if (worktree.summary) {
    if (isCommitMessage) {
      SummaryComponent = (
        <Text color={palette.text.tertiary}>
          {worktree.summary}
        </Text>
      );
    } else if (hasChanges) {
      SummaryComponent = (
        <Text color={palette.text.secondary}>
          {worktree.summary}
        </Text>
      );
    } else {
      SummaryComponent = (
        <Text color={palette.text.tertiary}>
          {worktree.summary}
        </Text>
      );
    }
  } else if (worktree.summaryLoading) {
    SummaryComponent = (
      <Text color={palette.text.tertiary}>
        Generating summary...
      </Text>
    );
  } else {
    const fallbackText = worktree.branch
      ? `Clean: ${worktree.branch}`
      : 'Ready';
    SummaryComponent = (
      <Text color={palette.text.tertiary}>
        {fallbackText}
      </Text>
    );
  }

  const accentColors = {
    added: palette.git.added,
    deleted: palette.git.deleted,
    modified: palette.git.modified,
    muted: palette.text.tertiary,
  };

  const branchLabel = worktree.branch ?? worktree.name;
  const isActive = worktree.isCurrent;
  const displayPath = formatPath(worktree.path);

  // Server status helpers
  const getServerStatusIndicator = () => {
    if (!serverState) return null;
    switch (serverState.status) {
      case 'stopped':
        return <Text color={palette.text.tertiary}></Text>;
      case 'starting':
        return <Text color={palette.alert.warning}></Text>;
      case 'running':
        return <Text color={palette.git.added}></Text>;
      case 'error':
        return <Text color={palette.alert.error}></Text>;
      default:
        return <Text color={palette.text.tertiary}></Text>;
    }
  };

  const getServerStatusText = (): React.ReactNode => {
    if (!serverState) return null;
    switch (serverState.status) {
      case 'stopped':
        return <Text color={palette.text.tertiary}>Dev Server</Text>;
      case 'starting':
        return <Text color={palette.alert.warning}>Starting...</Text>;
      case 'running':
        return serverState.url ? (
          <Text color={palette.git.added}>{serverState.url}</Text>
        ) : (
          <Text color={palette.git.added}>Running</Text>
        );
      case 'error':
        return (
          <Text color={palette.alert.error}>
            {serverState.errorMessage ? `Error: ${serverState.errorMessage.slice(0, 40)}` : 'Error'}
          </Text>
        );
      default:
        return <Text color={palette.text.tertiary}>Dev Server</Text>;
    }
  };

  const getServerButtonLabel = (): string => {
    if (!serverState) return 'Start';
    switch (serverState.status) {
      case 'stopped':
        return 'Start';
      case 'starting':
        return '...';
      case 'running':
        return 'Stop';
      case 'error':
        return 'Retry';
      default:
        return 'Start';
    }
  };

  const getServerButtonColor = (): string => {
    if (!serverState) return palette.git.added;
    switch (serverState.status) {
      case 'stopped':
        return palette.git.added;
      case 'starting':
        return palette.alert.warning;
      case 'running':
        return palette.alert.error;
      case 'error':
        return palette.git.added;
      default:
        return palette.text.secondary;
    }
  };

  // For main worktree, notes expire after 10 minutes (real-time)
  // Use state + effect to trigger re-render when note expires
  const [now, setNow] = useState(() => Date.now());

  // Set up timer to re-check note expiration for main worktree
  useEffect(() => {
    // Only need timer for main worktree with a valid note and timestamp
    if (!isMainWorktree || !aiNote || !aiNoteTimestamp) {
      return;
    }

    const expiresAt = aiNoteTimestamp + MAIN_WORKTREE_NOTE_TTL_MS;
    const timeUntilExpiry = expiresAt - Date.now();

    // Already expired - update state to trigger re-render
    if (timeUntilExpiry <= 0) {
      setNow(Date.now());
      return;
    }

    // Set timer to update when note expires
    const timer = setTimeout(() => {
      setNow(Date.now());
    }, timeUntilExpiry);

    return () => clearTimeout(timer);
  }, [isMainWorktree, aiNote, aiNoteTimestamp]);

  // Calculate effective note (applying TTL for main worktree)
  const effectiveNote = useMemo(() => {
    const trimmed = aiNote?.trim();
    if (!trimmed) return undefined;

    // For main worktree, check if note has expired
    if (isMainWorktree && aiNoteTimestamp) {
      const age = now - aiNoteTimestamp;
      if (age > MAIN_WORKTREE_NOTE_TTL_MS) {
        return undefined; // Note has expired
      }
    }

    return trimmed;
  }, [aiNote, isMainWorktree, aiNoteTimestamp, now]);

  // Memoize parsed note segments to avoid re-parsing on every render
  const parsedNoteSegments = useMemo(() => {
    return effectiveNote ? parseNoteWithLinks(effectiveNote) : [];
  }, [effectiveNote]);

  // Extract first URL for click handling
  const firstNoteUrl = useMemo(() => {
    return effectiveNote ? extractFirstUrl(effectiveNote) : null;
  }, [effectiveNote]);

  // Handler for clicking on note (opens first URL if present)
  const handleNoteClick = useCallback(() => {
    if (firstNoteUrl) {
      open(firstNoteUrl).catch(() => {
        // Silently ignore errors
      });
    }
  }, [firstNoteUrl]);

  // Layout key changes when button configuration changes, forcing re-registration of click regions
  const buttonLayoutKey = `${worktree.issueNumber ? 'i' : ''}${worktree.prNumber ? 'p' : ''}`;

  return (
    <Box flexDirection="column" width={terminalWidth} marginBottom={0}>
      {/* TOP BORDER with embedded action buttons */}
      <Box>
        <Text color={borderColor}>{BORDER.topLeft}</Text>
        <Text color={borderColor}>{BORDER.horizontal.repeat(lineWidth)}</Text>
        <BorderActionButton
          id={`${worktree.id}-copy`}
          label="Copy"
          color={palette.text.secondary}
          borderColor={borderColor}
          onPress={onCopyTree}
          registerRegion={registerClickRegion}
          layoutKey={buttonLayoutKey}
          listIndex={listIndex}
          terminalWidth={terminalWidth}
        />
        <BorderActionButton
          id={`${worktree.id}-code`}
          label="Code"
          color={palette.text.secondary}
          borderColor={borderColor}
          onPress={onOpenEditor}
          registerRegion={registerClickRegion}
          layoutKey={buttonLayoutKey}
          listIndex={listIndex}
          terminalWidth={terminalWidth}
        />
        {worktree.issueNumber && (
          <BorderActionButton
            id={`${worktree.id}-issue`}
            label="Issue"
            color={palette.accent.primary}
            borderColor={borderColor}
            onPress={onOpenIssue}
            registerRegion={registerClickRegion}
            layoutKey={buttonLayoutKey}
            listIndex={listIndex}
            terminalWidth={terminalWidth}
          />
        )}
        {worktree.prNumber && (
          <BorderActionButton
            id={`${worktree.id}-pr`}
            label="PR"
            color={palette.git.added}
            borderColor={borderColor}
            onPress={onOpenPR}
            registerRegion={registerClickRegion}
            layoutKey={buttonLayoutKey}
            listIndex={listIndex}
            terminalWidth={terminalWidth}
          />
        )}
        <Text color={borderColor}>{BORDER.horizontal}{BORDER.topRight}</Text>
      </Box>

      {/* BODY - use Ink's native border to handle dynamic height (sides + bottom) */}
      <Box
        width={terminalWidth}
        borderStyle="round"
        borderTop={false}
        borderColor={borderColor}
        paddingX={1}
        flexDirection="column"
      >
        {/* Header: Traffic light + Branch */}
        <Box marginBottom={0}>
          <Text bold color={headerColor}>
            <ActivityTrafficLight timestamp={worktree.lastActivityTimestamp} />
            <Text> </Text>
            {isActive && <Text color={palette.accent.primary}>{'\u25CF'} </Text>}
            {branchLabel}
          </Text>
          {!worktree.branch && (
            <Text color={palette.alert.warning}> (detached)</Text>
          )}
          {/* AI status badge */}
          {(() => {
            const aiDisplay = getPerCardAIStatus(worktree.aiStatus);
            return aiDisplay ? (
              <Text color={aiDisplay.color}> [{aiDisplay.label}]</Text>
            ) : null;
          })()}
        </Box>

        {/* Path (clickable) */}
        <Box marginBottom={0}>
          <Text
            color={palette.text.tertiary}
            underline={isFocused}
            // @ts-ignore - onClick exists but types don't expose it
            onClick={handlePathClick}
          >
            {displayPath}
          </Text>
        </Box>

        {/* Summary */}
        <Box marginTop={1}>
          {SummaryComponent}
        </Box>

        {/* Files (if any) */}
        {hasChanges && visibleChanges.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {visibleChanges.map(change => (
              <FileChangeRow
                key={`${change.path}-${change.status}`}
                change={change}
                rootPath={changes.rootPath}
                accentColors={accentColors}
                contentWidth={contentWidth}
              />
            ))}
            {remainingCount > 0 && (
              <Text dimColor>
                ...and {remainingCount} more
                {(() => {
                  // Get additional files not shown in the main list
                  const additionalFiles = sortedChanges.slice(MAX_VISIBLE_FILES);
                  if (additionalFiles.length === 0) return null;

                  // Take up to MAX_ADDITIONAL_NAMES filenames
                  const namesToShow = additionalFiles.slice(0, MAX_ADDITIONAL_NAMES);
                  const basenames = namesToShow.map(f => path.basename(f.path));
                  const hasMoreNames = additionalFiles.length > MAX_ADDITIONAL_NAMES;

                  return ` (${basenames.join(', ')}${hasMoreNames ? ', ...' : ''})`;
                })()}
              </Text>
            )}
          </Box>
        )}

        {/* Server status (inline, if applicable) */}
        {hasDevScript && serverState && (
          <Box marginTop={1} justifyContent="space-between">
            <Box gap={1}>
              {getServerStatusIndicator()}
              {getServerStatusText()}
              {isFocused && serverState.status !== 'starting' && (
                <Text color={palette.text.tertiary} dimColor>[s]</Text>
              )}
            </Box>
            <Text
              color={getServerButtonColor()}
              bold
              dimColor={serverState.status === 'starting'}
              // @ts-ignore - onClick exists but types don't expose it
              onClick={serverState.status !== 'starting' ? onToggleServer : undefined}
            >
              [{getServerButtonLabel()}]
            </Text>
          </Box>
        )}

        {/* Agent note (inline, if applicable) */}
        {effectiveNote && (
          <Box
            marginTop={1}
            // @ts-ignore - onClick exists but types don't expose it
            onClick={firstNoteUrl ? handleNoteClick : undefined}
          >
            <Text color={palette.text.secondary}>
              {parsedNoteSegments.map((segment, index) =>
                segment.type === 'link' ? (
                  <Text key={index} color={palette.accent.primary} underline>{segment.content}</Text>
                ) : (
                  <Text key={index}>{segment.content}</Text>
                )
              )}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

// PERF: Export memoized component with custom comparison
export const WorktreeCard = React.memo(WorktreeCardInner, (prevProps, nextProps) => {
  // Shallow compare scalar props
  if (prevProps.isFocused !== nextProps.isFocused) return false;
  if (prevProps.mood !== nextProps.mood) return false;
  if (prevProps.activeRootPath !== nextProps.activeRootPath) return false;
  if (prevProps.terminalWidth !== nextProps.terminalWidth) return false;

  // Compare worktree identity and content
  const prevWt = prevProps.worktree;
  const nextWt = nextProps.worktree;
  if (prevWt.id !== nextWt.id) return false;
  if (prevWt.summary !== nextWt.summary) return false;
  if (prevWt.summaryLoading !== nextWt.summaryLoading) return false;
  if (prevWt.modifiedCount !== nextWt.modifiedCount) return false;
  if (prevWt.lastActivityTimestamp !== nextWt.lastActivityTimestamp) return false;
  if (prevWt.aiStatus !== nextWt.aiStatus) return false;
  if (prevWt.issueNumber !== nextWt.issueNumber) return false;
  if (prevWt.prNumber !== nextWt.prNumber) return false;
  if (prevWt.prUrl !== nextWt.prUrl) return false;
  if (prevWt.prState !== nextWt.prState) return false;

  // Compare changes (check count and latest mtime for quick equality)
  const prevChanges = prevProps.changes;
  const nextChanges = nextProps.changes;
  if (prevChanges.changedFileCount !== nextChanges.changedFileCount) return false;
  if (prevChanges.latestFileMtime !== nextChanges.latestFileMtime) return false;
  if (prevChanges.totalInsertions !== nextChanges.totalInsertions) return false;
  if (prevChanges.totalDeletions !== nextChanges.totalDeletions) return false;

  // Compare server state
  if (prevProps.hasDevScript !== nextProps.hasDevScript) return false;
  const prevServer = prevProps.serverState;
  const nextServer = nextProps.serverState;
  if (prevServer?.status !== nextServer?.status) return false;
  if (prevServer?.url !== nextServer?.url) return false;
  if (prevServer?.errorMessage !== nextServer?.errorMessage) return false;

  // Compare AI note and timestamp
  if (prevProps.aiNote !== nextProps.aiNote) return false;
  if (prevProps.aiNoteTimestamp !== nextProps.aiNoteTimestamp) return false;
  if (prevProps.isMainWorktree !== nextProps.isMainWorktree) return false;

  // Compare list index (forces re-render when card position changes due to scrolling)
  if (prevProps.listIndex !== nextProps.listIndex) return false;

  // Callbacks are stable (created with useCallback in parent)
  return true;
});
