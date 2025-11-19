# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yellowwood is a terminal-based file browser built with Ink (React for CLIs). It's designed for developers working with AI agents, providing features like live file watching, git integration, git worktree support, and CopyTree integration for easy AI context sharing. Named after South Africa's tallest indigenous tree, symbolizing oversight and observation.

## Build Commands

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
   - Configuration loading via cosmiconfig (project `.yellowwood.json` → global `~/.config/yellowwood/config.json` → `DEFAULT_CONFIG`)
   - Git worktree discovery using `git worktree list --porcelain`
   - Session state restoration (selected path, expanded folders) from `~/.config/yellowwood/sessions/`
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

5. **Session Persistence**: Per-worktree state saved to `~/.config/yellowwood/sessions/`:
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
- `YellowwoodConfig` - User configuration (editor, git settings, display options, openers, CopyTree defaults)
- `YellowwoodState` - Application state (tree, selection, UI modes, worktrees)
- `GitStatus` - Git file status: `modified | added | deleted | untracked | ignored`
- `Notification` - User notifications: `info | success | error | warning`
- `Worktree` - Git worktree metadata (id, path, name, branch, isCurrent)
- `OpenerConfig` / `OpenersConfig` - File opener configuration by extension/glob pattern

### Component Architecture

Components in `src/components/` follow Ink's React-based model:

**Core UI**:
- `App.tsx` - Root component orchestrating all state and hooks
- `AppErrorBoundary.tsx` - Top-level error boundary for graceful failure
- `Header.tsx` - Shows current directory, filter status, and worktree badge
- `StatusBar.tsx` - Bottom bar with file count, git modified count, notifications
- `TreeView.tsx` - Main tree renderer with virtualization support
- `TreeNode.tsx` / `FileNode.tsx` / `FolderNode.tsx` - Node rendering with git status icons

**Interactive Elements**:
- `CommandBar.tsx` - Command input with history navigation
- `ContextMenu.tsx` - Right-click/keyboard-triggered context menu for file actions
- `WorktreePanel.tsx` - Worktree switcher modal (press `W` key)
- `HelpModal.tsx` - Keyboard shortcuts help overlay (press `?` key)

**Design Principles**:
- Components receive minimal props (prefer passing config/state from App)
- UI state managed in `App.tsx`, domain logic in hooks/utils
- Keyboard handling centralized in `useKeyboard` hook
- Modal state controls keyboard handler disabling (`anyModalOpen` flag)

### Custom Hooks

Located in `src/hooks/`:
- `useAppLifecycle.ts` - Application initialization and lifecycle management
- `useFileTree.ts` - File tree state, expansion, filtering, and refresh
- `useGitStatus.ts` - Git status fetching with caching and debouncing
- `useKeyboard.ts` - Centralized keyboard shortcut handling (Ink's `useInput` wrapper)
- `useMouse.ts` - Mouse click handling for tree interaction
- `useViewportHeight.ts` - Terminal viewport height calculation for pagination

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

Users configure Yellowwood via:
- Project: `.yellowwood.json` in project root
- Global: `~/.config/yellowwood/config.json`

**Key Options** (see `YellowwoodConfig` type):
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

**Navigation**:
- `↑/↓` - Navigate tree
- `←/→` - Collapse folder / expand folder or open file
- `PageUp/PageDown` - Page navigation
- `Home/End` - Jump to start/end
- `Space` - Toggle folder expansion
- `Enter` - Open file or toggle folder

**File Actions**:
- `c` - Copy file path to clipboard
- `m` - Open context menu

**Commands & UI**:
- `/` - Open command bar
- `Ctrl+F` - Open filter command (prefilled)
- `Esc` - Close modals/filter (priority: help → context menu → worktree panel → command bar → filter)
- `?` - Toggle help modal

**Git & Worktrees**:
- `g` - Toggle git status visibility
- `w` - Cycle to next worktree
- `W` - Open worktree panel

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
