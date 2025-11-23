export type GitStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'ignored';

export type FileType = 'file' | 'directory';

export type NotificationType = 'info' | 'success' | 'error' | 'warning';

export interface CopytreeProfile {
  args: string[];
  description?: string;
}

export interface WorktreeChanges {
  worktreeId: string;
  rootPath: string;
  changes: Array<{ path: string; status: GitStatus }>;
  changedFileCount: number;
  lastUpdated: number;
}

export type WorktreeMood = 'stable' | 'active' | 'stale' | 'error';

export interface TreeNode {
  name: string;
  path: string;
  type: FileType;
  size?: number;
  modified?: Date;
  gitStatus?: GitStatus;
  children?: TreeNode[];
  expanded?: boolean;
  depth: number;
  recursiveGitCount?: number; // Added: Tracks total changes in subtree
}

export interface Notification {
  message: string;
  type: NotificationType;
}

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
  changes?: Array<{ path: string; status: GitStatus }>;

  /** High-level mood/state for dashboard sorting */
  mood?: WorktreeMood;
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

/**
 * Represents a single file system activity event captured from the watcher.
 * Paths are relative to the workspace root for consistency.
 */
export interface ActivityEvent {
  /** Workspace-relative path to the file/directory */
  path: string;
  /** Type of file system change */
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  /** Unix timestamp (milliseconds) when the event occurred */
  timestamp: number;
}

/**
 * Configuration options for the Recent Activity feature.
 */
export interface RecentActivityConfig {
  /** Whether the feature is enabled */
  enabled: boolean;
  /** Time window in minutes to keep events (older events are pruned) */
  windowMinutes: number;
  /** Maximum number of events to retain (oldest are pruned) */
  maxEntries: number;
}

/**
 * Import context menu configuration types
 */
import type { ContextMenuConfig } from './contextMenu.js';
import type { KeyMapConfig } from './keymap.js';

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
  copytreeProfiles?: Record<string, CopytreeProfile>;
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
    showStatusBar?: boolean;
    activePathHighlight?: boolean;
    activePathColor?: 'cyan' | 'blue' | 'green';
  moodGradients?: boolean; // Enable mood-based header gradients (default: true)
  };
  worktrees?: {
    enable: boolean;           // Master toggle for worktree features
    showInHeader: boolean;     // Show/hide worktree indicator in header
    refreshIntervalMs?: number; // Optional: auto-refresh interval (0 = disabled)
  };
  recentActivity?: RecentActivityConfig;
  contextMenu?: ContextMenuConfig;
  git?: {
    statusStyle?: 'letter' | 'glyph'; // 'letter' = M/A/D, 'glyph' = ● (default: 'glyph')
    folderHeatMap?: boolean; // Enable folder heat coloring (default: true)
    heatMapIntensity?: 'subtle' | 'normal' | 'intense'; // Heat scaling (default: 'normal')
  };
  search?: {
    defaultAction?: 'open' | 'copy'; // Action when pressing Enter on search result
    limit?: number; // Maximum number of search results to show
    respectGitignore?: boolean; // Whether to respect gitignore in search (inherits from respectGitignore if not set)
  };
  keys?: KeyMapConfig; // Configurable keyboard shortcuts with preset support
}

export interface CanopyState {
  fileTree: TreeNode[];
  expandedFolders: Set<string>;
  selectedPath: string | null;
  cursorPosition: number;
  showPreview: boolean;
  showHelp: boolean;
  contextMenuOpen: boolean;
  contextMenuPosition: { x: number; y: number };
  filterActive: boolean;
  filterQuery: string;
  filteredPaths: string[];
  gitStatus: Map<string, GitStatus>;
  gitEnabled: boolean;
  notification: Notification | null;
  commandBarActive: boolean;
  commandBarInput: string;
  commandHistory: string[];
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
    showStatusBar: true,
    activePathHighlight: true,
    activePathColor: 'cyan',
    moodGradients: true,
  },
  worktrees: {
    enable: true,              // Enabled by default for backwards compatibility
    showInHeader: true,        // Show indicator by default
    refreshIntervalMs: 10000,  // 10 second refresh by default
  },
  copytreeProfiles: {
    default: {
      args: ['-r'],
      description: 'Standard recursive scan (uses .copytree.yml if present)'
    },
    minimal: {
      args: ['--tree-only', '--depth', '2'],
      description: 'Structure only, max depth 2'
    },
    debug: {
      args: ['--verbose', '--no-cache'],
      description: 'Verbose output with cache disabled'
    },
    docs: {
      args: ['-p', 'docs'],
      description: 'Documentation only'
    }
  },
  recentActivity: {
    enabled: true,             // Enabled by default
    windowMinutes: 10,         // Keep events from last 10 minutes
    maxEntries: 50,            // Maximum 50 events in buffer
  },
  git: {
    statusStyle: 'glyph',      // Use color-coded glyphs by default
    folderHeatMap: true,       // Enable heat mapping by default
    heatMapIntensity: 'normal', // Normal intensity by default
  },
  search: {
    defaultAction: 'open',     // Open file by default on Enter
    limit: 20,                 // Show top 20 results
    respectGitignore: true,    // Respect gitignore by default
  },
};
