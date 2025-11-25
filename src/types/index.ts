export type GitStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'ignored' | 'renamed';

export type NotificationType = 'info' | 'success' | 'error' | 'warning';

export interface FileChangeDetail {
  path: string;
  status: GitStatus;
  insertions: number | null;
  deletions: number | null;
  mtimeMs?: number; // File modification time in milliseconds (for recency scoring)
}

export interface WorktreeChanges {
  worktreeId: string;
  rootPath: string;
  changes: FileChangeDetail[];
  changedFileCount: number;
  totalInsertions?: number;
  totalDeletions?: number;
  insertions?: number;
  deletions?: number;
  latestFileMtime?: number;
  lastUpdated: number;
}

export type WorktreeMood = 'stable' | 'active' | 'stale' | 'error';

// Dev Server Types
export type DevServerStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface DevServerState {
  worktreeId: string;
  status: DevServerStatus;
  url?: string;
  port?: number;
  pid?: number;
  errorMessage?: string;
  logs?: string[];
}

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
}

export type NotificationPayload = Omit<Notification, 'id'> & { id?: string };

/**
 * Represents a single git worktree.
 * Git worktrees allow multiple working trees attached to the same repository,
 * enabling work on different branches simultaneously.
 */
export interface Worktree {
  /** Stable identifier for this worktree (normalized absolute path) */
  id: string;

  /** Absolute path to the worktree root directory */
  path: string;

  /** Human-readable name (branch name or last path segment) */
  name: string;

  /** Git branch name if available (undefined for detached HEAD) */
  branch?: string;

  /** Whether this is the currently active worktree based on cwd */
  isCurrent: boolean;

  /** AI-generated summary of work being done (optional) */
  summary?: string;

  /** Number of modified files in this worktree (optional) */
  modifiedCount?: number;

  /** Loading state for async summary generation */
  summaryLoading?: boolean;

  /** Recent git status changes for this worktree */
  changes?: FileChangeDetail[];

  /** High-level mood/state for dashboard sorting */
  mood?: WorktreeMood;

  /** Timestamp of last git activity (milliseconds since epoch, null if no activity yet) */
  lastActivityTimestamp?: number | null;
}

export interface OpenerConfig {
  /** Command to execute (editor name or path) */
  cmd: string;

  /** Arguments to pass to command */
  args: string[];
}

export interface OpenersConfig {
  /** Fallback opener used when no patterns match */
  default: OpenerConfig;

  /** Extension-based opener mapping */
  byExtension: Record<string, OpenerConfig>;

  /** Glob pattern-based opener mapping */
  byGlob: Record<string, OpenerConfig>;
}

import type { KeyMapConfig } from './keymap.js';

/**
 * Represents a configurable quick link for external tools (chat clients, dashboards, etc.)
 */
export interface QuickLink {
  /** Display label for the link */
  label: string;
  /** URL to open in default browser */
  url: string;
  /** Optional keyboard shortcut number (1-9) for Cmd+{num} access */
  shortcut?: number;
  /** Optional slash command name (e.g., "gemini" for /gemini) */
  command?: string;
}

/**
 * Configuration for the quick links feature
 */
export interface QuickLinksConfig {
  /** Enable/disable the quick links feature (default: true) */
  enabled: boolean;
  /** Configured links */
  links: QuickLink[];
}

export interface CanopyConfig {
  editor: string;
  editorArgs: string[];
  theme: 'auto' | 'dark' | 'light';
  customTheme?: string; // Optional path to custom theme JSON file
  showHidden: boolean;
  showGitStatus: boolean;
  showFileSize: boolean;
  showModifiedTime: boolean;
  respectGitignore: boolean;
  customIgnores: string[];
  copytreeDefaults: {
    format: string;
    asReference: boolean;
  };
  openers?: OpenersConfig;
  autoRefresh: boolean;
  refreshDebounce: number;
  usePolling: boolean;
  treeIndent: number;
  maxDepth: number | null;
  sortBy: 'name' | 'size' | 'modified' | 'type';
  sortDirection: 'asc' | 'desc';
  ui?: {
    leftClickAction?: 'open' | 'select';
    compactMode?: boolean;
    activePathHighlight?: boolean;
    activePathColor?: 'cyan' | 'blue' | 'green';
  };
  worktrees?: {
    enable: boolean;           // Master toggle for worktree features
    showInHeader: boolean;     // Show/hide worktree indicator in header
  };
  git?: {
    statusStyle?: 'letter' | 'glyph'; // 'letter' = M/A/D, 'glyph' = ● (default: 'glyph')
    folderHeatMap?: boolean; // Enable folder heat coloring (default: true)
    heatMapIntensity?: 'subtle' | 'normal' | 'intense'; // Heat scaling (default: 'normal')
  };
  keys?: KeyMapConfig; // Configurable keyboard shortcuts with preset support
  quickLinks?: QuickLinksConfig; // Quick links to external tools and chat clients
  devServer?: {
    command?: string;     // Custom dev server command (e.g., "npm run start:frontend")
    autoStart?: boolean;  // Auto-start servers on Canopy launch (default: false)
    enabled?: boolean;    // Enable/disable dev server feature (default: false, must be explicitly enabled)
  };
}

export interface CanopyState {
  filterActive: boolean;
  filterQuery: string;
  gitStatus: Map<string, GitStatus>;
  gitEnabled: boolean;
  notification: Notification | null;
  config: CanopyConfig;
  worktrees: Worktree[];
  activeWorktreeId: string | null;
}

export const DEFAULT_CONFIG: CanopyConfig = {
  editor: 'code',
  editorArgs: ['-r'],
  theme: 'auto',
  showHidden: false,
  showGitStatus: true,
  showFileSize: false,
  showModifiedTime: false,
  respectGitignore: true,
  customIgnores: [
    '**/.git/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.DS_Store',
    '**/coverage/**',
    '**/__pycache__/**',
  ],
  copytreeDefaults: {
    format: 'xml',
    asReference: true,
  },
  openers: {
    default: { cmd: 'code', args: ['-r'] },
    byExtension: {},
    byGlob: {},
  },
  autoRefresh: true,
  refreshDebounce: 100,
  usePolling: true,
  treeIndent: 2,
  maxDepth: null,
  sortBy: 'name',
  sortDirection: 'asc',
  ui: {
    leftClickAction: 'open',
    compactMode: true,
    activePathHighlight: true,
    activePathColor: 'cyan',
  },
  worktrees: {
    enable: true,              // Enabled by default for backwards compatibility
    showInHeader: true,        // Show indicator by default
  },
  git: {
    statusStyle: 'glyph',      // Use color-coded glyphs by default
    folderHeatMap: true,       // Enable heat mapping by default
    heatMapIntensity: 'normal', // Normal intensity by default
  },
  quickLinks: {
    enabled: true,
    links: [], // Empty by default - user configures their own links
  },
  devServer: {
    enabled: false,       // Disabled by default - must be explicitly enabled in project config
    autoStart: false,     // Don't auto-start servers
    // command: undefined - auto-detect from package.json
  },
};
