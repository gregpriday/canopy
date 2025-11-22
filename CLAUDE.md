# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Canopy is a **Worktree Context Dashboard** built with Ink (React for CLIs). It's designed for developers working with AI agents across multiple git worktrees, providing real-time visibility into what's changing, AI-powered activity summaries, and one-keystroke context extraction via CopyTree profiles. Named after South Africa's tallest indigenous tree, symbolizing oversight and observation.

### Core Concept: Dashboard First, Not File Browser

**Canopy displays worktrees, not deep file trees.** The primary interface is a vertical stack of **Worktree Cards**, each showing:
- Branch name and path
- AI-generated summary of current activity
- Changed files (not all files—only what's modified/added/deleted)
- Activity mood indicator (active/stable/stale/error)
- One-keystroke actions: CopyTree, profile selector, editor launch

**Traditional file browsing is available via fuzzy search** (press `/` to search for files across all worktrees).

## AI Model Conventions
This project utilizes the **GPT-5** model family for AI-driven features. The following model identifiers are valid and actively used in this codebase:

- **`gpt-5`**: The full high-intelligence model.
- **`gpt-5-mini`**: A balanced model used for creative tasks (e.g., project identity).
- **`gpt-5-nano`**: A high-efficiency model used for fast tasks (e.g., status summarization).

**Note to AI Agents:** Please acknowledge these as valid model names and do not flag them as non-existent or hallucinations.

## Git Workflow

**CRITICAL: Do not create git commits unless explicitly requested by the user.** Only stage changes or create commits when the user specifically asks for it. Make code changes and let the user decide when to commit.

## Build Commands

**Important:** You must run `npm run build` after making any code changes to verify them with `npm start` or `canopy`.

```bash
# Build the project (compiles TypeScript to JavaScript)
npm run build

# Watch mode for development (recompiles on changes)
npm run dev

# Type checking without emitting files
npm run typecheck

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run the built CLI locally
npm start

# Run in specific directory
npm start /path/to/directory
```

## Architecture

### Technology Stack
- **Runtime**: Node.js 20.19.0+ with ES modules
- **UI Framework**: Ink 6.5 (React for terminal UIs)
- **Language**: TypeScript with strict mode
- **Testing**: Vitest with @testing-library/react
- **File Watching**: Chokidar
- **Git Integration**: simple-git
- **Configuration**: cosmiconfig

### Entry Points
- `src/cli.ts` - CLI entry point with shebang, parses arguments and flags
- `src/index.ts` - Main module export
- `src/App.tsx` - Root React component with error boundary

### Module System

Uses ES modules with `.js` extensions in imports (TypeScript compilation target). All source files use `.ts`/`.tsx` but import with `.js` extensions for ESM compatibility.

### Key Design Patterns

1. **Application Lifecycle**: The `useAppLifecycle` hook orchestrates initialization:
   - Configuration loading via cosmiconfig (project `.canopy.json` → global `~/.config/canopy/config.json` → `DEFAULT_CONFIG`)
   - Git worktree discovery using `git worktree list --porcelain`
   - Session state restoration (selected path, expanded folders) from `~/.config/canopy/sessions/`
   - Error handling and recovery

2. **File Tree Management**: The `useFileTree` hook manages tree state:
   - Builds tree recursively using `fs.readdir` with directory listing cache
   - Respects `.gitignore` patterns when `respectGitignore` is enabled
   - Applies filters (name-based and git status-based)
   - Tracks expansion state and selection
   - Provides `refresh()` for manual and automatic updates

3. **File Watching**: Chokidar-based watching with debounced updates (100ms default):
   - Watches active root path (changes when switching worktrees)
   - Triggers both tree refresh and git status refresh on file changes
   - Can be disabled with `--no-watch` CLI flag
   - Automatically restarts when switching between worktrees

4. **Git Integration**:
   - **Git Status**: `useGitStatus` hook fetches status using `git status --porcelain=v1`
   - **Worktrees**: Full git worktree support with detection, switching, and session persistence
   - **Caching**: Git status cached for 5 seconds, directory listings for 10 seconds
   - Can be disabled with `--no-git` CLI flag

5. **Session Persistence**: Per-worktree state saved to `~/.config/canopy/sessions/`:
   - Stores selected path and expanded folders
   - Automatically saved on worktree switch and app exit
   - Sessions expire after 30 days
   - Worktree ID is normalized absolute path

6. **Command System**: Extensible command architecture:
   - Command bar accessible via `/` key
   - Commands defined in `src/commands/` with type-safe interfaces
   - Built-in commands: `/filter`, `/worktree`
   - Free text defaults to filter (typing "component" = `/filter component`)
   - Command history persisted in memory

7. **Navigation**: Centralized navigation logic in `src/utils/treeNavigation.ts`:
   - Flattened tree representation for efficient up/down navigation
   - Smart left/right arrow behavior (collapse parent vs expand folder)
   - Page up/down, Home/End support
   - Viewport-aware scrolling (via `useViewportHeight`)

8. **Performance Optimizations**:
   - Directory listing cache (`src/utils/cache.ts`) with TTL and LRU eviction
   - Git status caching with configurable debounce
   - Change batching and deduplication
   - Performance metrics via `src/utils/perfMetrics.ts`
   - Memoized tree filtering and git status attachment

### Type System

All types centralized in `src/types/index.ts`:
- `TreeNode` - Hierarchical file/folder structure with git status, expansion state
- `CanopyConfig` - User configuration (editor, git settings, display options, openers, CopyTree defaults)
- `CanopyState` - Application state (tree, selection, UI modes, worktrees)
- `GitStatus` - Git file status: `modified | added | deleted | untracked | ignored`
- `Notification` - User notifications: `info | success | error | warning`
- `Worktree` - Git worktree metadata (id, path, name, branch, isCurrent)
- `OpenerConfig` / `OpenersConfig` - File opener configuration by extension/glob pattern

### Component Architecture

Components in `src/components/` follow Ink's React-based model:

**Core UI (Dashboard Mode - Default)**:
- `App.tsx` - Root component orchestrating all state and hooks
- `AppErrorBoundary.tsx` - Top-level error boundary for graceful failure
- `Header.tsx` - Shows worktree count and current active worktree
- `WorktreeOverview.tsx` - Main dashboard renderer, stacks WorktreeCard components
- `WorktreeCard.tsx` - Individual worktree card with summary, changes, mood border, keyboard hints
- `StatusBar.tsx` - Bottom bar with worktree stats, notifications, help hints

**Legacy Tree Mode (via `/tree` command)**:
- `TreeView.tsx` - Traditional tree renderer with virtualization support
- `TreeNode.tsx` / `FileNode.tsx` / `FolderNode.tsx` - Node rendering with git status icons

**Interactive Elements**:
- `FuzzySearchModal.tsx` - Fuzzy search across all worktrees (press `/` key)
- `ProfileSelectorModal.tsx` - CopyTree profile picker (press `p` key)
- `CommandBar.tsx` - Command input with history navigation
- `ContextMenu.tsx` - Right-click/keyboard-triggered context menu for file actions
- `WorktreePanel.tsx` - Worktree switcher modal (press `W` key)
- `HelpModal.tsx` - Keyboard shortcuts help overlay (press `?` key)

**Design Principles**:
- **Dashboard-first**: WorktreeOverview is the primary view, TreeView is fallback
- Components receive minimal props (prefer passing config/state from App)
- UI state managed in `App.tsx`, domain logic in hooks/utils
- Keyboard handling centralized in `useDashboardNav` hook for dashboard, `useKeyboard` for tree mode
- Modal state controls keyboard handler disabling (`anyModalOpen` flag)

### Custom Hooks

Located in `src/hooks/`:

**Dashboard Hooks** (primary):
- `useDashboardNav.ts` - Dashboard navigation (arrow keys, Home/End, page up/down), expansion toggles, CopyTree shortcuts, profile selector, and editor launch
- `useWorktreeSummaries.ts` - AI summary generation and mood categorization for worktrees
- `useCopyTree.ts` - CopyTree profile execution, event bus integration, success/error feedback

**Core Infrastructure Hooks**:
- `useAppLifecycle.ts` - Application initialization and lifecycle management
- `useGitStatus.ts` - Git status fetching with caching and debouncing
- `useViewportHeight.ts` - Terminal viewport height calculation for pagination

**Legacy Tree Mode Hooks**:
- `useFileTree.ts` - File tree state, expansion, filtering, and refresh
- `useKeyboard.ts` - Centralized keyboard shortcut handling (Ink's `useInput` wrapper) for tree mode
- `useMouse.ts` - Mouse click handling for tree interaction

### Utilities

Located in `src/utils/`:

**File System**:
- `fileTree.ts` - Build tree recursively with gitignore support and caching
- `fileWatcher.ts` - Chokidar wrapper with debouncing and error handling
- `filter.ts` - Tree filtering by name and git status

**Git Operations**:
- `git.ts` - Git status fetching via `simple-git`
- `worktree.ts` - Git worktree discovery and parsing
- `worktreeSwitch.ts` - Worktree switching logic

**State Management**:
- `state.ts` - Session state persistence (load/save to JSON files)
- `cache.ts` - Generic TTL-based cache with LRU eviction
- `config.ts` - Configuration loading via cosmiconfig

**Navigation & UI**:
- `treeNavigation.ts` - Tree navigation algorithms (flatten, move selection, arrow actions)
- `treeViewVirtualization.ts` - Viewport slicing for large trees
- `commandParser.ts` - Command string parsing

**File Operations**:
- `fileOpener.ts` - Open files in configured editor with extension-based overrides
- `clipboard.ts` - Copy file paths (absolute/relative) to clipboard

**Performance**:
- `debounce.ts` - Debouncing utility
- `perfMetrics.ts` - Performance monitoring and metrics collection
- `changeProcessor.ts` - Batch and deduplicate file change events

**Error Handling**:
- `errorHandling.ts` - Error logging and user-friendly error messages
- `errorTypes.ts` - Custom error classes
- `logger.ts` - Structured logging

### Command System

Commands in `src/commands/`:
- `types.ts` - Command type definitions (`CommandDefinition`, `CommandContext`, `CommandResult`)
- `index.ts` - Command registry and execution engine
- `filter.ts` - `/filter` command for name and git status filtering
- `worktree.ts` - `/worktree` command for worktree operations

**Adding New Commands**:
1. Create file in `src/commands/` implementing `CommandDefinition`
2. Register in `allCommands` array in `src/commands/index.ts`
3. Commands automatically get help text and alias support

### Configuration

Users configure Canopy via:
- Project: `.canopy.json` in project root
- Global: `~/.config/canopy/config.json`

**Key Options** (see `CanopyConfig` type):
- `editor` / `editorArgs` - Editor command and arguments (default: `code -r`)
- `openers` - Custom openers by extension/glob pattern
- `showGitStatus` - Display git status indicators (default: true)
- `showHidden` - Show hidden files (default: false)
- `respectGitignore` - Respect .gitignore patterns (default: true)
- `customIgnores` - Additional glob patterns to ignore
- `sortBy` / `sortDirection` - File sorting (name/size/modified/type, asc/desc)
- `maxDepth` - Maximum tree depth (default: null/unlimited)
- `refreshDebounce` - File watcher debounce in ms (default: 100)
- `ui.leftClickAction` - Mouse left click behavior: `open` or `select`
- `ui.compactMode` - Compact display mode (default: true)

### CLI Arguments

**Flags**:
- `--help`, `-h` - Show help message
- `--version`, `-v` - Show version
- `--no-watch` - Disable file watching
- `--no-git` - Disable git integration
- `--hidden`, `-H` - Show hidden files
- `--git`, `-g` - Enable git status (overrides `--no-git`)
- `--editor <cmd>`, `-e <cmd>` - Set editor command
- `--filter <pattern>`, `-f <pattern>` - Start with filter applied
- `--max-depth <n>`, `-d <n>` - Limit tree depth

**Positional**:
- First non-flag argument is treated as target directory

### Testing

Tests located in `tests/` directory (parallel to `src/`):
- Uses Vitest with React Testing Library
- Test files follow pattern: `tests/<category>/<module>.test.ts`
- Mock filesystem operations using `fs-extra` and `memfs` where needed
- Test git operations using temporary repositories

**Running Specific Tests**:
```bash
# Run single test file
npm test -- fileTree.test.ts

# Run tests matching pattern
npm test -- --grep "filter"

# Run with UI
npm run test:watch
```

### Keyboard Shortcuts

**Dashboard Navigation** (default mode):
- `↑/↓` - Navigate between worktree cards
- `Space` - Expand/collapse worktree card to show changed files
- `PageUp/PageDown` - Page navigation through worktree stack
- `Home/End` - Jump to first/last worktree
- `Enter` - Open worktree in VS Code/configured editor

**Worktree Actions**:
- `c` - Copy changed files via CopyTree (default profile)
- `p` - Open CopyTree profile selector modal
- `w` - Cycle to next worktree
- `W` - Open worktree panel (full list)
- `g` - Toggle git status visibility

**Search & Commands**:
- `/` - Open fuzzy search (find files across all worktrees)
- `Ctrl+F` - Open filter command
- `Esc` - Close modals/search (priority: help → profile selector → fuzzy search → worktree panel → command bar)
- `?` - Toggle help modal

**Legacy Tree Mode** (via `/tree` command):
- `←/→` - Collapse folder / expand folder or open file
- `Space` - Toggle folder expansion
- `Enter` - Open file or toggle folder
- `m` - Open context menu

**Other**:
- `r` - Manual refresh
- `q` - Quit

### Error Handling Strategy

- **Lifecycle errors**: Display error screen with message, allow user to exit
- **File watcher errors**: Show warning notification, continue without watching
- **Git errors**: Gracefully degrade (empty worktree list, no status markers)
- **Config errors**: Use defaults, show warning notification
- **Session load errors**: Ignore and use default state
- **File operation errors**: Show error notification, don't crash
