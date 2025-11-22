# Canopy – Complete Technical Specification

**Version:** MVP v1.0
**Last Updated:** 2025-11-18
**Project Status:** In Development - Batch 01 in progress

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Current Codebase State](#current-codebase-state)
3. [Architecture](#architecture)
4. [Type System](#type-system)
5. [User Specification](#user-specification)
6. [Implementation Guidelines](#implementation-guidelines)
7. [Testing Strategy](#testing-strategy)
8. [Batch Organization](#batch-organization)

---

## Project Overview

**Canopy** is a **Worktree Context Dashboard** built with **Ink** (React for CLIs). It's designed for developers who:

- Work in **narrow vertical terminal splits** (e.g., Ghostty vertical panes)
- Use **AI coding tools** (Claude Code, Codex CLI, Gemini CLI)
- Need **multi-worktree visibility** to monitor parallel AI agent tasks
- Want **one-keystroke context extraction** via CopyTree profiles
- Require **AI-powered summaries** of what's changing in each worktree

**Name Origin:** Named after South Africa's tallest indigenous tree, the Outeniqua Canopy, symbolizing oversight from a commanding vantage point.

**Key Features:**
- **Worktree Dashboard**: Vertical stack of cards showing all git worktrees simultaneously
- **AI Summaries**: GPT-5-powered descriptions of activity in each worktree
- **Mood Indicators**: Visual categorization of worktrees (active/stable/stale/error)
- **CopyTree Profiles**: One-keystroke context packet generation for AI prompts
- **Fuzzy Search**: Fast file lookup across all worktrees
- **Live Updates**: Real-time file watching with instant dashboard refresh
- **VS Code Integration**: Direct editor launch from worktree cards

---

## Current Codebase State

### What Exists (Implemented)

**Type System** (`src/types/index.ts`):
- ✅ Complete type definitions: `TreeNode`, `CanopyConfig`, `CanopyState`
- ✅ `GitStatus`, `Notification`, `FileType`, `NotificationType` enums
- ✅ `DEFAULT_CONFIG` with all default values

**CLI Entry Point** (`src/cli.ts`):
- ✅ Shebang for standalone execution
- ✅ Accepts optional directory argument
- ✅ Renders App component with Ink

**Root Component** (`src/App.tsx`):
- ✅ Basic layout structure (Header, TreeView, StatusBar)
- ✅ State management for config, fileTree, selectedPath, notification, loading
- ❌ TODO: Load configuration from cosmiconfig
- ❌ TODO: Build initial file tree
- ❌ TODO: Set up file watcher

**Implemented Components:**

1. **Header** (`src/components/Header.tsx` - 26 lines):
   - ✅ Displays "Canopy - {current directory}"
   - ✅ Shows filter status when active
   - ❌ Needs: Worktree indicator (wt [main] (3))

2. **TreeView** (`src/components/TreeView.tsx` - 30 lines):
   - ✅ Maps over fileTree array
   - ✅ Basic folder/file icon rendering (⟹/≡)
   - ❌ Needs: Full navigation, selection, expansion logic

3. **StatusBar** (`src/components/StatusBar.tsx` - 34 lines):
   - ✅ Shows notifications or file statistics
   - ✅ Displays file count and modified count
   - ✅ Help hint: "Press ? for help"

**Build System:**
- ✅ TypeScript compilation working
- ✅ ES modules with .js extensions
- ✅ Source maps and declarations generated
- ✅ npm scripts: build, dev, typecheck, start

**Dependencies** (package.json):
- Runtime: ink@6.5, react@19.2
- File watching: chokidar@4.0
- Git: simple-git@3.30
- Config: cosmiconfig@9.0
- Utils: fs-extra@11.3, globby@16.0, clipboardy@5.0, execa@9.6
- UI: ink-select-input@6.2, ink-text-input@6.0, ink-spinner@5.0
- Dev: TypeScript@5.9, vitest (testing framework)

### What Needs Implementation (Empty Stubs)

**Components (7 empty stubs):**
- `TreeNode.tsx` - Individual tree node renderer
- `FileNode.tsx` - File-specific rendering
- `FolderNode.tsx` - Folder-specific rendering
- `SearchBar.tsx` - Search/filter input
- `PreviewPane.tsx` - Optional file preview
- `ContextMenu.tsx` - Right-click context menu
- `HelpModal.tsx` - Help overlay

**Custom Hooks (3 empty stubs):**
- `useFileTree.ts` - File tree state management
- `useKeyboard.ts` - Keyboard input handling
- `useGitStatus.ts` - Git status tracking

**Utilities (3 empty stubs):**
- `config.ts` - Configuration loading
- `fileWatcher.ts` - File system watching
- `git.ts` - Git operations

---

## Architecture

### Technology Stack

- **Framework:** Ink 6.5 (React for terminal UIs)
- **Language:** TypeScript 5.9 with strict mode
- **Runtime:** Node.js 18+ with ES modules
- **File Watching:** Chokidar 4.0
- **Git Integration:** simple-git 3.30
- **Configuration:** cosmiconfig 9.0
- **Clipboard:** clipboardy 5.0
- **Process Execution:** execa 9.6
- **Filesystem:** fs-extra 11.3, globby 16.0

### Component Hierarchy

```
App (src/App.tsx)
├── Header (src/components/Header.tsx)
│   └── Worktree count and active indicator
├── WorktreeOverview (src/components/WorktreeOverview.tsx) [DASHBOARD MODE]
│   └── WorktreeCard (recursive stack)
│       ├── Worktree summary (AI-generated)
│       ├── Changed files list (when expanded)
│       ├── Mood border (active/stable/stale/error)
│       └── Keyboard hints (space/c/p/Enter)
├── TreeView (src/components/TreeView.tsx) [LEGACY TREE MODE - /tree command]
│   └── TreeNode (recursive)
│       ├── FolderNode (directories)
│       └── FileNode (files)
├── FuzzySearchModal (fuzzy search overlay)
├── ProfileSelectorModal (CopyTree profile picker)
├── CommandBar (slash command input)
├── ContextMenu (right-click actions)
├── HelpModal (keyboard shortcuts)
├── WorktreePanel (worktree switcher)
└── StatusBar (src/components/StatusBar.tsx)
```

**Default Mode:** Dashboard (WorktreeOverview)
**Fallback Mode:** Tree (TreeView via `/tree` command)

### State Management

- **Local State:** React `useState` for component-level state
- **Custom Hooks:** Complex state logic (file tree, keyboard, git status)
- **No Global Store:** Ink apps keep state simple, pass via props

### File System Operations

- **Discovery:** Use `globby` for file pattern matching
- **Watching:** Use `chokidar` for file system events
- **Respect .gitignore:** When `respectGitignore` config is true

### Configuration Cascade

```
Project (.canopy.json)
  ↓ overrides
Global (~/.config/canopy/config.json)
  ↓ overrides
DEFAULT_CONFIG (src/types/index.ts)
```

---

## Type System

### Core Types (src/types/index.ts)

```typescript
// Basic Types
export type GitStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'ignored';
export type FileType = 'file' | 'directory';
export type NotificationType = 'info' | 'success' | 'error' | 'warning';

// Tree Structure
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

// Notifications
export interface Notification {
  message: string;
  type: NotificationType;
}

// Configuration
export interface CanopyConfig {
  editor: string;              // Default: 'code'
  editorArgs: string[];        // Default: ['-r']
  theme: 'auto' | 'dark' | 'light';  // Default: 'auto'
  showHidden: boolean;         // Default: false
  showGitStatus: boolean;      // Default: true
  showFileSize: boolean;       // Default: false
  showModifiedTime: boolean;   // Default: false
  respectGitignore: boolean;   // Default: true
  customIgnores: string[];     // Default: []
  copytreeDefaults: {
    format: string;            // Default: 'xml'
    asReference: boolean;      // Default: true
  };
  autoRefresh: boolean;        // Default: true
  refreshDebounce: number;     // Default: 100 (ms)
  treeIndent: number;          // Default: 2 (spaces)
  maxDepth: number | null;     // Default: null (unlimited)
  sortBy: 'name' | 'size' | 'modified' | 'type';  // Default: 'name'
  sortDirection: 'asc' | 'desc';  // Default: 'asc'
}

// Application State
export interface CanopyState {
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
  config: CanopyConfig;
}

// Default Configuration
export const DEFAULT_CONFIG: CanopyConfig = {
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
};
```

### Worktree Dashboard Types

```typescript
// Worktree with mood and summary
export interface Worktree {
  id: string;       // stable identifier (normalized path)
  path: string;     // absolute path to worktree root
  name: string;     // e.g., last segment or branch name
  branch?: string;  // branch name if available
  isCurrent: boolean;
  mood?: WorktreeMood;  // activity categorization
  summary?: string;     // AI-generated summary
}

// Activity mood categories
export type WorktreeMood = 'active' | 'stable' | 'stale' | 'error';

// Changed files per worktree
export interface WorktreeChanges {
  worktreeId: string;
  rootPath: string;
  changes: FileChange[];
  changedFileCount: number;
  lastUpdated: number;
}

export interface FileChange {
  path: string;
  relativePath: string;
  status: GitStatus;
  isStaged: boolean;
}

// CopyTree Profile Configuration
export interface CopyTreeProfile {
  format?: 'xml' | 'markdown' | 'json';
  asReference?: boolean;
  filter?: string;
  extraArgs?: string[];
}

export interface CopyTreeProfiles {
  default: CopyTreeProfile;
  [profileName: string]: CopyTreeProfile;
}

// File Opener Configuration
export interface OpenerConfig {
  cmd: string;
  args: string[];
}

export interface OpenersConfig {
  default: OpenerConfig;
  byExtension: Record<string, OpenerConfig>;
  byGlob: Record<string, OpenerConfig>;
}
```

---

## Product Requirements Alignment

The following subsections mirror the canonical Canopy PRD to ensure this document references every requirement from the full specification shared above.

### 1. Overview

- Canopy is a terminal-based file browser built with Ink and React that behaves like a dedicated file-explorer pane for narrow vertical terminals (Ghostty, kitty, etc.).
- The tool targets developers who rely on AI coding agents (Claude Code, Codex CLI, Gemini CLI) that edit the working tree in the background and want continuous awareness of filesystem changes, git status, and worktrees.
- Naming inspiration: the Outeniqua Canopy (South Africa’s tallest indigenous tree) represents an always-on vantage point that oversees the repo.

### 2. Core Purpose and Constraints

**Primary use case:**
- One persistent terminal column (≈60–70 columns wide) runs Canopy while other panes are used for editing, terminals, and AI agents.
- Canopy shows a live file tree rooted at the active git worktree, highlights changes regardless of whether the user or an agent made them, and enables quick navigation/opening.
- Mouse and keyboard interaction coexist for efficiency; slash commands provide textual control without leaving the tree.

**Key constraints:**
- Optimized for narrow widths; no preview pane or dual columns.
- Minimal horizontal clutter: primary data is the file/folder name with git status; optionally surface size/mtime but disabled by default.
- Must feel native to mouse workflows yet never compromise keyboard ergonomics.
- Works seamlessly across git worktrees and will integrate CopyTree in later phases.

### 3. Core Concepts

1. **File Tree** – Hierarchical, collapsible, VSCode-style explorer tuned for compact render width with indentation limits and truncation.
2. **Git Worktrees** – Detect all worktrees for the repo, show the active entry in the header, and allow switching (keyboard, mouse, slash commands).
3. **Live File Watching** – Watch filesystem changes for the active worktree, synthesize git status, and update the UI in near real time.
4. **Slash Commands** – `/` opens a command bar for filters, git filters, worktree commands, CopyTree, and future extensions.
5. **File Opening** – Enter/click opens files via configurable openers; contextual “Open with…” choices allow alternate editors/commands.
6. **CopyTree Integration (Phase 2+)** – Provide fast path copying in MVP and evolve toward command builders, templates, and CopyTree reference sharing.

### 4. User Experience and Layout

```text
┌──────────────────────────────────────────┐
│ Canopy • wt [main] (3) • /src       │ Header
├──────────────────────────────────────────┤
│ ▶ src/                                  │
│   ▶ components/                         │
│     - Button.tsx                  M     │
│     - Input.tsx                   M     │
│   ▶ utils/                             │
│     - helpers.ts                  A     │
│ ▶ tests/                                │
│ - package.json                          │
│ - README.md                             │
│   …                                     │  TreeView (scrollable)
├──────────────────────────────────────────┤
│ 12 files • 3 modified • /filter: .ts    │ Status Bar / Command hints
└──────────────────────────────────────────┘
```

- **Icons:** `▶`/`▼` for collapsed/expanded folders, `-` for files, optional Unicode themes once terminals allow.
- **Git markers:** Rightmost fixed-width character uses `M`, `A`, `D`, `U`, and optionally `I` for ignored or `•` when recently changed.
- **Color defaults:** Folders blue/cyan, files white/gray, modified yellow/orange, added green, deleted red (dim/strikethrough optional), untracked gray, selected row uses highlighted background. Filter mode surfaces discrete header/status pill.
- **Header:** Shows app name, current worktree indicator (clickable `[branch]` with `(count)`), current directory (root-relative path), and filter/git state such as `/git: modified`.
- **Status bar:** Single line containing stats (`12 files • 3 modified`), filter or git filter summaries, and hints like `Press ? for help • / for commands`.

### 5. Detailed Feature Set

#### 5.1 File Tree Display

- Hierarchical tree begins at the selected root (active worktree path by default) with unlimited depth (configurable `maxDepth`).
- Folder interactions: left-click, `Space`, or arrow keys toggle expand/collapse (`→` expand, `←` collapse). Files open on `Enter`/click, optionally `→`.
- Optional metadata columns for file size and modified time (short ISO format) exist but off by default; git status marker occupies a fixed trailing slot.
- Color coding honors the active theme (`dark`, `light`, `auto`). Ignored entries can be dimmed, and custom ignore patterns supplement `.gitignore`.
- Narrow layout optimizations include minimal indent (`treeIndent` = 1–2), ellipsis truncation, and virtualization/windowing for large lists.

#### 5.2 Mouse Support

- Left-click on folders toggles expansion; left-click on files opens them with the default opener.
- Scroll wheel scrolls the tree; right-click (or keyboard fallback `m`) opens a context menu where terminals support it.
- **Context menu actions:** Open (default), Open with (list configured editors/openers), Copy absolute path, Copy relative path, Copy CopyTree reference (Phase 2+), Reveal in Finder/Explorer/Nautilus, and future custom actions.

#### 5.3 Live File Watching

- Uses `chokidar` to watch the active worktree root. Events (create/modify/delete/rename directories and files) update the internal tree and schedule git status refresh via debounced re-runs.
- Visual feedback can include transient highlights or dot indicators for recently changed files even if the user is not focused there.
- Performance controls: `refreshDebounce` (ms) for events, `autoRefresh` toggle, and selective watching (root only vs. expanded subtrees) to keep CPU/RAM under control.

#### 5.4 CopyTree Integration (Phase 2+)

- **MVP:** `c` copies the currently selected path (relative/absolute per config). Context menu exposes the same copy variants.
- **Phase 2+:** `c` can trigger CopyTree reference generation using configured defaults, writing output to clipboard and showing `✓ CopyTree reference copied`. `C` or `/copytree` opens a CopyTree Command Builder overlay:

```text
┌─────────────────────────────────────────┐
│ CopyTree Command Builder                │
├─────────────────────────────────────────┤
│ Path: src/components/Button.tsx         │
│                                         │
│ Flags:                                  │
│ [ ] -t  (tree only)                     │
│ [x] -r  (as reference)                  │
│ [ ] -m  (modified files)                │
│ [x] --format markdown                   │
│                                         │
│ Command: copytree src/components/...    │
│                                         │
│ [Run] [Save Template] [Cancel]          │
└─────────────────────────────────────────┘
```

- Command history remembers the last N CopyTree invocations, and saved templates (configurable) prefill the builder.

#### 5.5 Keyboard Navigation and Shortcuts

- Navigation: `↑/↓` move selection, `←` collapses or moves to parent, `→` expands or opens, `PageUp/PageDown` or `Ctrl+U/Ctrl+D` scrolls the viewport.
- Opening/toggling: `Enter` opens files or toggles folders (configurable), `Space` toggles expansion without opening.
- Worktrees: `w` cycles to next worktree, `W` opens the Worktree Panel overlay.
- Commands: `/` opens the command bar, `Ctrl+F` pre-fills `/filter `.
- Git visibility: `g` toggles git markers.
- Copy/CopyTree: `c` copies path or CopyTree ref, `C` opens the CopyTree builder.
- Misc: `r` manual refresh, `?` help overlay, `q` quit, `m` context menu. All bindings will eventually be configurable.

#### 5.6 Configuration System

- Config hierarchy: project `.canopy.json` overrides global `~/.config/canopy/config.json`, both override `DEFAULT_CONFIG`.
- Values include editor commands, theme, git visibility, metadata toggles, `autoRefresh`, `refreshDebounce`, tree indentation, depth, sorting, CopyTree defaults, and UI options.
- Configurable openers and UI behavior allow different commands per extension/glob and mouse-click semantics. Example:

```json
{
  "editor": "code",
  "editorArgs": ["-r"],
  "theme": "auto",
  "showHidden": false,
  "showGitStatus": true,
  "showFileSize": false,
  "showModifiedTime": false,
  "respectGitignore": true,
  "customIgnores": [],
  "copytreeDefaults": {
    "format": "markdown",
    "asReference": true,
    "extraArgs": []
  },
  "autoRefresh": true,
  "refreshDebounce": 100,
  "treeIndent": 1,
  "maxDepth": null,
  "sortBy": "name",
  "sortDirection": "asc",
  "worktrees": {
    "enable": true,
    "refreshIntervalMs": 10000,
    "showInHeader": true
  },
  "openers": {
    "default": { "cmd": "code", "args": ["-r"] },
    "byExtension": {
      ".log": { "cmd": "less", "args": ["+G"] }
    },
    "byGlob": {
      "tests/**/*.ts": { "cmd": "code", "args": ["-r"] }
    }
  },
  "ui": {
    "compactMode": true,
    "showStatusBar": true,
    "leftClickAction": "open"
  }
}
```

#### 5.7 Search / Filter (Slash Command powered)

- `/` opens the command bar; typing free text that does not match a command implicitly does `/filter <text>`. `Ctrl+F` opens with `/filter ` prefilled.
- `/filter <pattern>` (alias `/f`) performs fuzzy matching across names while keeping ancestors if descendants match. `/filter clear` or Esc without input clears.
- Git filters: `/git modified|added|deleted|untracked` and `/changed` limit the tree to paths whose git status matches. Multiple filters surface in the status bar (`/filter: .ts • /git: modified`).

#### 5.8 Worktree Support

- On startup, `git worktree list --porcelain` builds the Worktree list when inside a git repo. If none detected, git features disable gracefully.
- Data model:

```ts
interface Worktree {
  id: string;
  path: string;
  name: string;
  branch?: string;
  isCurrent: boolean;
}
```

- State keeps `worktrees`, `activeWorktreeId`, and `worktreeLastUpdated`. Only the active worktree is watched/rendered; switching stops the previous watcher, rebuilds the tree, and optionally restores the last selection for that worktree.
- UI: Header shows `wt [branch] (count)`. Clicking `[branch]` or pressing `W` opens the Worktree Panel overlay listing paths, with `/wt` commands (`/wt list|next|prev|<name>`) and `w`/`W` keyboard shortcuts to switch.

#### 5.9 Slash Commands / Command Bar

- `/` opens a bottom command bar while dimming the tree; Enter executes, Esc cancels, up/down cycles history.
- Free text defaults to `/filter`, so typing `.ts` without a verb still filters.
- Supported commands: `/filter`, `/filter clear`, `/git modified|added|deleted|untracked`, `/changed`, `/wt list|next|prev|<name>`, `/open <path>`, `/copytree`, `/copytree <path> [flags...]`. API must be pluggable for future commands.

### 6. Technical Architecture

- **Technology stack:** Ink, React 19, TypeScript 5.9, Node 18+, chokidar, simple-git, cosmiconfig, clipboardy, fs-extra, globby, execa, term-size, supports-hyperlinks.
- **Component structure:** `Canopy` (root orchestrator), `Header` with `WorktreeIndicator`, `TreeView` rendering recursive `TreeNode`/`FolderNode`/`FileNode`, `ContextMenu`, `CommandBar`, `StatusBar`, `HelpModal`, `WorktreePanel`.
- **Responsibilities:** Canopy loads config, file trees, git status, watchers; Header displays context and handles worktree switching; TreeView manages selection, scrolling, virtualization; CommandBar parses/executes commands; WorktreePanel lists worktrees; ContextMenu drives opener/copy actions; HelpModal shows shortcuts.
- **State management:** See interfaces below; state tracks file tree, expanded folders, selection, UI overlays, command bar input/history, filters, git/worktree data, notifications, and merged config.

```ts
type GitStatusType = 'modified' | 'added' | 'deleted' | 'untracked' | 'ignored' | 'clean';

interface GitStatus {
  path: string;
  status: GitStatusType;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
  gitStatus?: GitStatusType;
  children?: TreeNode[];
  expanded?: boolean;
  depth: number;
}

interface Notification {
  message: string;
  type: 'info' | 'success' | 'error';
}

interface CanopyState {
  fileTree: TreeNode[];
  expandedFolders: Set<string>;
  selectedPath: string | null;
  cursorPosition: number;
  showHelp: boolean;
  contextMenuOpen: boolean;
  contextMenuPosition: { x: number; y: number } | null;
  commandBarActive: boolean;
  commandBarInput: string;
  commandHistory: string[];
  filterActive: boolean;
  filterQuery: string | null;
  filterGitStatus: GitStatusType | null;
  gitStatus: Map<string, GitStatusType>;
  gitEnabled: boolean;
  worktrees: Worktree[];
  activeWorktreeId: string | null;
  worktreeLastUpdated: number | null;
  notification: Notification | null;
  config: CanopyConfig;
}
```

### 7. CLI and Commands

- Main command: `canopy [path] [options]` with options `-e/--editor`, `-c/--config`, `-g/--git`, `-h/--hidden`, `-f/--filter`, `-d/--max-depth`, `--no-watch`, `--no-git`, `--help`, `--version`.
- Examples: `canopy`, `canopy /path/to/project`, `canopy -f .ts`, `canopy --git`.
- Utility commands: `canopy init`, `canopy config`, `canopy config --validate`, plus the global `--help`/`--version` shortcuts.
- `canopy config` opens the active config in the configured editor (running `canopy init` if no config exists).

### 8. Git Integration

- On startup Canopy detects if the target is a git repo. Git features (status markers, filters, worktrees) disable gracefully when not available or when `--no-git` is supplied.
- Git status detection maps statuses to marker letters: Modified → `M`, Added → `A`, Deleted → `D`, Untracked → `U`, Ignored → `I`, Clean → blank. `g` toggles marker visibility per user preference.
- Git-aware slash commands (`/git ...`, `/changed`) filter the tree to relevant paths, keeping ancestor folders visible. Git operations always execute in the active worktree.
- Worktree-aware git status refresh occurs on worktree switches, manual `r` refreshes, and debounced watcher events.

### 9. Performance Considerations

**Optimization strategies:** lazy load directories, virtualize TreeView rows, debounce watcher/git events (~100 ms), cache directory listings/git status/file stats, selectively watch only expanded subtrees, rely on async I/O to keep the UI responsive.

**Targets:** initial load <500 ms for ~1000 files, watch-to-UI latency <100 ms, smooth scrolling (~60 FPS feel), memory usage <100 MB, idle CPU <5% with watchers running.

### 10. Error Handling

- **Graceful degradation:** disable git-specific UI when outside repos, fail soft when editor commands are missing (fall back to `$VISUAL`/`$EDITOR` or prompt for config), warn/skip directories with permission issues, guard against very large directories by prompting before expanding, and fall back to manual `r` refresh if watchers fail.
- **User notifications:** four severities (success/info/warning/error). Success/info/warning auto-dismiss after ~2–5s, errors persist until dismissed. Examples: `success` for CopyTree copy, `info` for worktree switch, `warning` for directories exceeding thresholds, `error` for watcher failures.

### 11. Future Enhancements and Roadmap

- **Phase 1 – MVP (2–3 weeks):** tree view for a single worktree, mouse+keyboard navigation, default editor opening, live file watching, git indicators, worktree detection/switching, slash bar with filter/git/worktree basics, configuration system, CLI.
- **Phase 2 – Enhancements (1–2 weeks):** complete CopyTree integration, richer git filtering, improved openers and “Open with…”, new slash commands (`/open`, `/changed`), worktree niceties (better naming/tags).
- **Phase 3 – Polish (1+ week):** performance tuning for huge repos, multi-select/bulk actions, custom actions/plugins, remote/SSH browsing, grep/search integration, workspace persistence, collaboration/sharing of tree state.

### 12. Testing and Quality

- **Unit tests:** component rendering (Header, TreeView, TreeNode, CommandBar, etc.), reducer/state logic (expand/collapse, selection, filters, worktree switching), configuration parsing/merging, file tree builders, git status parsing, slash command parsing/execution.
- **Integration tests:** watcher behavior (fs changes propagate), editor launching across file types, worktree switching (tree + watcher transitions), copy path/CopyTree flows (clipboard handshake).
- **E2E tests:** simulate navigation, worktree changes, filters, file opening, copy/copytree commands, large directory performance, and cross-platform verification (macOS/Linux/Windows/WSL).

### 13. Documentation

- **User docs:** `README.md` (overview/install/quick start), `USAGE.md` (workflow-focused instructions, Ghostty vertical split tips), `CONFIG.md` (all config keys/examples), `SHORTCUTS.md` (keyboard + mouse reference), `FAQ.md` (git missing, editor missing, performance tips).
- **Developer docs:** `ARCHITECTURE.md` (component/state/data flow), `CONTRIBUTING.md`, `API.md` (public hooks/command APIs), `CHANGELOG.md`.

### 14. Success Metrics

- **Metrics:** adoption (npm downloads/week), usage (active users via optional telemetry), performance (initial load, watch latency), reliability (error rates), satisfaction (GitHub stars, user feedback).
- **Launch criteria:** implement/stabilize tree view, navigation, editor opening, live watching, git indicators + worktree switching, slash command bar with filter/git/worktree commands, configuration system with defaults, docs for installing/basic usage, cross-platform testing, and acceptable error handling/performance tuning.

### Performance Targets (Quick Reference)

- Initial load <500 ms for ~1000 files, file watch update <100 ms, smooth navigation near 60 FPS, memory <100 MB, idle CPU <5%. (Duplicated intentionally for quick lookup.)

---

## Implementation Guidelines

### Module System

- **ES Modules Only:** Use `import`/`export`, not `require`
- **File Extensions:** Always use `.js` in imports (TypeScript compiles to .js)
- **Example:** `import { loadConfig } from '../utils/config.js';`

### Coding Standards

**TypeScript:**
- Strict mode enabled
- No `any` types (use `unknown` if needed)
- Explicit return types for exported functions
- Interface for all props

**React/Ink:**
- Function components only (no classes)
- Named exports for components
- Props interface exported alongside component
- Use hooks (useState, useEffect, useInput, etc.)

**Error Handling:**
- Missing files: Not an error, return defaults
- Invalid config: Throw descriptive error
- Git not installed: Warn, continue with git disabled
- Permission errors: Log warning, skip inaccessible files

**Async Operations:**
- Use async/await (not callbacks)
- All file I/O must be async
- Handle errors with try/catch
- Return sensible defaults on error

**Logging:**
- Use `console.log` for INFO
- Use `console.warn` for non-fatal issues
- Use `console.error` for fatal errors (before throwing)
- Keep logging minimal

### Patterns to Follow

**Configuration:**
- Load once at startup
- Merge with precedence: project > global > default
- Validate types before using
- Treat config as immutable

**File Tree:**
- Build from filesystem, not git
- Attach git status separately
- Support lazy loading (expand on demand)
- Sort by configured sort order

**Git Status:**
- Use simple-git library (already installed)
- Return Map<path, GitStatus>
- Clean files NOT in map (optimization)
- Refresh on file changes (debounced)

**File Watching:**
- Use chokidar (already installed)
- Debounce events (100ms default)
- Watch only active worktree root
- Clean up watchers on worktree switch

**State Management:**
- Component state for local UI state
- Custom hooks for complex state logic
- Pass state down via props
- Lift state when shared

### Patterns to Avoid

- ❌ Synchronous file I/O (`fs.readFileSync`)
- ❌ Mutating props or state
- ❌ Using `any` type
- ❌ Hardcoded paths (use `path.join`)
- ❌ Forgetting useEffect cleanup
- ❌ Blocking operations in render
- ❌ Console.log in production (except intentional logging)

---

## Testing Strategy

### Test Framework

- **Vitest:** Main test runner
- **ink-testing-library:** For testing Ink components
- **Mocking:** Use `vi.fn()` for mocks, `vi.mock()` for modules

### Test Coverage Targets

- **Utilities:** 80%+ coverage
- **Components:** 70%+ coverage
- **Hooks:** 75%+ coverage
- **Integration:** Key workflows tested

### Test Structure

```typescript
// Test file naming: test_<module>.ts or test_<component>.tsx
// Location: tests/ mirrors src/ structure

describe('moduleName', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('does something specific', () => {
    // Arrange
    // Act
    // Assert
  });
});
```

### Testing Utilities

- Use temp directories for file system tests
- Create real git repos for git tests (can be slow)
- Use fake timers for testing auto-dismiss, debouncing
- Mock filesystem when appropriate
- Don't pollute real config directories

### Testing Ink Components

```typescript
import { render } from 'ink-testing-library';
import { MyComponent } from '../src/components/MyComponent.js';

it('renders correctly', () => {
  const { lastFrame } = render(<MyComponent />);
  expect(lastFrame()).toContain('Expected text');
});

it('handles keyboard input', () => {
  const { stdin } = render(<MyComponent />);
  stdin.write('x'); // Simulate keypress
});
```

---

## Batch Organization

### Batch 01: Foundation (Issues #1-3)
**No dependencies - can all run in parallel**

- #1: Implement configuration loading system
- #2: Implement notification system
- #3: Implement git status detection and parsing

### Batch 02: Core Utils (Issues #4-9)
**Depends on: Batch 01**

- #4: Implement worktree detection and listing (needs #1)
- #5: Implement file tree builder from filesystem (needs #1)
- #6: Implement filter logic for name and git status (needs #1)
- #7: Implement useKeyboard hook for input handling (needs #1)
- #8: Implement mouse event handling (needs #1)
- #9: Implement useGitStatus hook (needs #3)

### Batch 03: Hooks & Base Components (Issues #10-15)
**Depends on: Batch 02**

- #10: Implement useFileTree hook (needs #5, #6)
- #11: Implement file watcher with chokidar (needs #1, #5)
- #12: Implement file opener system (needs #1)
- #13: Implement clipboard operations (needs #1)
- #14: Implement TreeNode component (needs #1)
- #15: Implement CommandBar component (needs #7)

### Batch 04: UI Components (Issues #16-21)
**Depends on: Batch 03**

- #16: Implement FileNode component (needs #14)
- #17: Implement FolderNode component (needs #14)
- #18: Enhance Header with worktree indicator (needs #4)
- #19: Enhance StatusBar with file statistics (needs #9)
- #20: Implement HelpModal component (needs #7)
- #21: Implement WorktreePanel component (needs #4, #7)

### Batch 05: Commands & Context (Issues #22-26)
**Depends on: Batch 04**

- #22: Implement command parser and execution (needs #15)
- #23: Implement ContextMenu component (needs #8, #12, #13)
- #24: Implement worktree switching logic (needs #4, #11)
- #25: Implement filter slash commands (needs #22, #6)
- #26: Implement git filter slash commands (needs #22, #9)

### Batch 06: Tree View & Integration (Issues #28-32)
**Depends on: Batch 05**

- #28: Enhance TreeView with full navigation (needs #17, #7, #8)
- #29: Implement worktree slash commands (needs #22, #4)
- #30: Sync git status with worktree switches (needs #24, #9)
- #31: Wire file operations into TreeView (needs #28, #12)
- #32: Integrate worktree UI with Header (needs #18, #21)

### Batch 07: Performance & Polish (Issues #33-36)
**Depends on: Batch 06**

- #33: Add virtualization to TreeView (needs #28)
- #34: Add debouncing and caching (needs #11, #9)
- #35: Implement error handling and recovery (needs #2)
- #36: Implement CLI argument parsing (needs #1)

### Batch 08: App Orchestration (Issues #37-40)
**Depends on: Batch 07**

- #37: Wire all hooks into App.tsx (needs #10, #7, #9)
- #38: Implement app lifecycle (startup/shutdown) (needs #37, #11)
- #39: Implement initial state loading (needs #37, #4)
- #40: Wire all keyboard shortcuts (needs #37, #7)

### Batch 09: Testing & Docs (Issues #41-44)
**Depends on: Batch 08**

- #41: Add tests for core utilities (needs #1, #3, #4, #5)
- #42: Add tests for UI components (needs #28, #15)
- #43: Add integration tests (needs #38)
- #44: Create user documentation (needs #38)

---

## Development Workflow

### Setting Up

```bash
git clone https://github.com/gregpriday/canopy
cd canopy
npm install
npm run build
```

### Development Commands

```bash
npm run dev          # Watch mode (recompiles on changes)
npm run build        # Compile TypeScript to JavaScript
npm run typecheck    # Type checking without emitting files
npm start           # Run the built CLI locally
npm test            # Run test suite
```

### Running Locally

```bash
# Run in current directory
npm start

# Run in specific directory
npm start /path/to/directory
```

### Before Committing

1. Run `npm run typecheck` - must pass with no errors
2. Run `npm test` - all tests must pass
3. Ensure .js extensions in all imports
4. No console.log statements (except intentional logging)
5. Update tests if changing behavior

---

## Key Resources

### External Documentation

- [Ink Documentation](https://github.com/vadimdemedes/ink) - Terminal UI framework
- [simple-git](https://github.com/steveukx/git-js) - Git library
- [chokidar](https://github.com/paulmillr/chokidar) - File watcher
- [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) - Config loader
- [React Hooks](https://react.dev/reference/react) - React documentation

### Internal Files

- `src/types/index.ts` - All type definitions
- `src/App.tsx` - Main application component
- `src/cli.ts` - CLI entry point
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `CLAUDE.md` - Project guidance for AI agents

---

## Common Pitfalls

1. **Import extensions:** Always use `.js` in imports, not `.ts`
2. **Async file I/O:** Never use sync operations
3. **useEffect cleanup:** Always return cleanup function for timers/watchers
4. **Git not installed:** Handle gracefully, don't crash
5. **Windows paths:** Use `path.join()`, never hardcode `/` or `\`
6. **Timer leaks:** Clear all setTimeout/setInterval in cleanup
7. **State mutations:** Never mutate state directly, use setState
8. **Type safety:** Avoid `any`, use proper TypeScript types

---

## Future Phases (Not MVP)

### Phase 2: Enhancements
- Full CopyTree integration
- Richer git filtering
- Better "openers" support
- Command bar extensions
- Worktree niceties

### Phase 3: Polish
- Performance optimization for huge repositories
- Multi-select and bulk operations
- Custom actions/plugins
- Remote/SSH browse support
- Grep/search integration
- Workspace support (save/load tree state)

---

**This specification is the single source of truth for Canopy development. All issues and implementation work should reference this document.**
