export type GitStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'ignored';

export type FileType = 'file' | 'directory';

export type NotificationType = 'info' | 'success' | 'error' | 'warning';

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
}

export interface Notification {
  message: string;
  type: NotificationType;
}

export interface YellowwoodConfig {
  editor: string;
  editorArgs: string[];
  theme: 'auto' | 'dark' | 'light';
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
  autoRefresh: boolean;
  refreshDebounce: number;
  treeIndent: number;
  maxDepth: number | null;
  sortBy: 'name' | 'size' | 'modified' | 'type';
  sortDirection: 'asc' | 'desc';
  ui?: {
    leftClickAction?: 'open' | 'select';
    compactMode?: boolean;
    showStatusBar?: boolean;
  };
}

export interface YellowwoodState {
  fileTree: TreeNode[];
  expandedFolders: Set<string>;
  selectedPath: string;
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
  config: YellowwoodConfig;
}

export const DEFAULT_CONFIG: YellowwoodConfig = {
  editor: 'code',
  editorArgs: ['-r'],
  theme: 'auto',
  showHidden: false,
  showGitStatus: true,
  showFileSize: false,
  showModifiedTime: false,
  respectGitignore: true,
  customIgnores: [],
  copytreeDefaults: {
    format: 'xml',
    asReference: true,
  },
  autoRefresh: true,
  refreshDebounce: 100,
  treeIndent: 2,
  maxDepth: null,
  sortBy: 'name',
  sortDirection: 'asc',
  ui: {
    leftClickAction: 'open',
    compactMode: true,
    showStatusBar: true,
  },
};
