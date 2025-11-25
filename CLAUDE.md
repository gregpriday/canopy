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

**Traditional file browsing is available via tree mode** (accessible via the `/tree` command).

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

6. **Event-Driven Architecture**: Centralized event bus in `src/services/events.ts`:
   - Type-safe event publishing and subscription using EventEmitter
   - Event categories: `sys:*`, `nav:*`, `file:*`, `ui:*`, `watcher:*`, `sys:worktree:*`
   - Enables decoupled communication between components and services
   - Debug mode via `CANOPY_DEBUG_EVENTS=1` environment variable
   - Returns unsubscribe function for React useEffect cleanup

7. **Multi-Worktree Status Tracking**: Real-time git status polling across all worktrees:
   - Active worktree refreshes every 5 seconds
   - Background worktrees refresh every 60 seconds
   - File-level change details with insertions/deletions counts
   - Isolated error handling per worktree (one failure doesn't affect others)

8. **AI-Powered Summaries**: Intelligent worktree activity summaries using GPT models:
   - Zero-cost mode for clean worktrees (displays last commit message)
   - Zero-context diffs for token efficiency (1500 character budget)
   - 30-second debounce with immediate updates on dirty→clean transitions
   - File skeletonization for new files (structure without full content)
   - Resilient JSON parsing with multiple fallback strategies
   - Worktree mood categorization: stable, active, stale, or error

9. **Navigation**: Centralized navigation logic in `src/utils/treeNavigation.ts`:
   - Flattened tree representation for efficient up/down navigation
   - Smart left/right arrow behavior (collapse parent vs expand folder)
   - Page up/down, Home/End support
   - Viewport-aware scrolling (via `useViewportHeight`)

10. **Performance Optimizations**:
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
- `WorktreeChanges` - File-level change details for a worktree
  - Maps file paths to `FileChangeDetail` with insertions/deletions counts
  - Includes modification time tracking for prioritization
- `FileChangeDetail` - Individual file change metadata (status, insertions, deletions, mtime)
- `WorktreeMood` - Worktree categorization: `'stable' | 'active' | 'stale' | 'error'`
- `RepositoryMood` - Repository state: `'clean' | 'additions' | 'modifications' | 'mixed' | 'deletions' | 'conflict'`

Additional type modules in `src/types/`:
- `keymap.ts` - Keyboard mapping types and shortcut definitions
- `contextMenu.ts` - Context menu item types and action definitions

### Component Architecture

Components in `src/components/` follow Ink's React-based model:

**Core UI (Dashboard Mode - Default)**:
- `App.tsx` - Root component orchestrating all state and hooks
- `AppErrorBoundary.tsx` - Top-level error boundary for graceful failure
- `Header.tsx` - Shows worktree count and current active worktree
- `WorktreeOverview.tsx` - Main dashboard renderer, stacks WorktreeCard components
- `WorktreeCard.tsx` - Individual worktree card with summary, changes, mood border, keyboard hints
*removed* `StatusBar.tsx` - was bottom bar with worktree stats/notifications (now retired)

**Legacy Tree Mode (via `/tree` command)**:
- `TreeView.tsx` - Traditional tree renderer with virtualization support
- `TreeNode.tsx` / `FileNode.tsx` / `FolderNode.tsx` - Node rendering with git status icons

**Interactive Elements**:
- `ProfileSelector.tsx` - CopyTree profile picker (press `p` key)
- `ContextMenu.tsx` - Right-click/keyboard-triggered context menu for file actions
- `WorktreePanel.tsx` - Worktree switcher modal (press `W` key)
- `Notification.tsx` - Toast-style notifications (info/success/error/warning)
- `RecentActivityPanel.tsx` - Recent file activity panel

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
- `useWorktreeSummaries.ts` - AI summary generation and mood categorization
  - 30-second debounce for AI calls to reduce costs
  - Immediate update when worktree transitions dirty→clean (shows last commit)
  - Prioritizes worktrees by change count (most changed summarized first)
  - Integrates with `useMultiWorktreeStatus` for change detection
- `useCopyTree.ts` - CopyTree profile execution, event bus integration, success/error feedback

**AI & Summary Hooks**:
- `useProjectIdentity.ts` - Project identity with AI generation and caching
  - Fetches/generates emoji, title, and gradient colors
  - Caches results by project hash in `~/.config/canopy/identities/`
  - Falls back to default identity if `OPENAI_API_KEY` not set
- `useAIStatus.ts` - Debounced AI status updates from git diffs
  - Subscribes to git status changes
  - Generates human-readable status descriptions
  - Debug logging via `DEBUG_AI_STATUS=1`

**Multi-Worktree Management**:
- `useWorktreeMonitor.ts` - **Primary hook** for accessing worktree state
  - Subscribes to `sys:worktree:update` and `sys:worktree:remove` events from WorktreeService
  - Returns `Map<string, WorktreeState>` with complete worktree information
  - Event-driven architecture (no polling in the hook itself)
  - Polling is handled by `WorktreeService` and `WorktreeMonitor` instances
- `useMultiWorktreeStatus.ts` - **Legacy hook** (kept for backward compatibility in tests)
  - Direct polling implementation (replaced by WorktreeService architecture)
  - Active worktree: 5-second refresh interval
  - Background worktrees: 60-second refresh interval
  - Not used in production code - only in tests
  - Consider using `useWorktreeMonitor` for new code

**Activity Tracking**:
- `useActivity.ts` - Real-time file activity tracking based on watcher events
  - "The Flash" state: 0-2 seconds after change
  - "The Cooldown" state: 2-10 seconds after change
  - "Idle" state: >60 seconds after change
  - Subscribes to `watcher:change` events from event bus
  - UI updates throttled to 200ms (5fps) to prevent terminal flashing during high-frequency operations
- `useRecentActivity.ts` - Recent file activity history tracking

**Core Infrastructure Hooks**:
- `useAppLifecycle.ts` - Application initialization and lifecycle management
- `useGitStatus.ts` - Git status fetching with caching and debouncing
- `useRepositoryStats.ts` - Repository stats (commits, issues, PRs) with adaptive polling
  - Active mode (30s): Polls frequently when user is actively working
  - Idle mode (5min): Polls slowly when no activity for 2+ minutes
  - Subscribes to `watcher:change` to boost activity state
  - Subscribes to `sys:refresh` for immediate fetch on manual refresh (r key)
- `useViewportHeight.ts` - Terminal viewport height calculation for pagination
- `useWatcher.ts` - Chokidar file system watching with event bus integration

**Input Handling**:
- `useTerminalMouse.ts` - Terminal mouse event handling (clicks, drags, scrolls)
- `useKeyboard.ts` - Centralized keyboard shortcut handling (Ink's `useInput` wrapper)
- `useMouse.ts` - Mouse click handling for tree interaction (legacy tree mode)

**Legacy Tree Mode Hooks**:
- `useFileTree.ts` - File tree state, expansion, filtering, and refresh

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
- `keySequences.ts` - Terminal escape sequences for Home/End keys (multi-terminal support)
- `keyMatcher.ts` - Keyboard shortcut matching logic
- `mouseInput.ts` - Mouse input handling utilities

**File Operations**:
- `fileOpener.ts` - Open files in configured editor with extension-based overrides
- `clipboard.ts` - Copy file paths (absolute/relative) to clipboard
- `fileIcons.ts` - File type to icon mapping (visual file identification)

**Worktree & Mood**:
- `worktreeMood.ts` - Categorize worktrees as `stable`, `active`, `stale`, or `error`
  - Checks last commit age and current change count
  - Stable: Clean with recent commits
  - Active: Has changes
  - Stale: No recent commits (>7 days)
  - Error: Git operation failures
- `repositoryMood.ts` - Analyze git status for repository mood
  - Moods: `clean`, `additions`, `modifications`, `mixed`, `deletions`, `conflict`
  - Used for visual gradients and UI coloring
- `moodColors.ts` - Map `WorktreeMood` to terminal border colors
  - Stable: green, Active: yellow, Error: red, Stale: gray

**AI Context**:
- `aiContext.ts` - Gather git diff context for AI analysis
  - Sorts files by modification time (most recent first)
  - Limits to last 5 changed files for token efficiency
  - Provides structured context for GPT model consumption

**Visual & UI**:
- `folderHeatMap.ts` - Folder heat colors based on change intensity
  - Cyan → Yellow → Orange → Red gradient
  - Configurable intensity levels: subtle, normal, intense
  - Helps visualize "hot spots" in file tree
- `treeGuides.ts` - Tree line characters (├─, └─, │, etc.)
  - ASCII art for hierarchical tree display
- `nodeStyling.ts` - Tree node visual styling (colors, formatting)
- `pathAncestry.ts` - Path ancestry utilities (find common parents, etc.)
- `time.ts` - Time formatting utilities (relative times, durations)

**Search & Matching**:
- `fuzzyMatch.ts` - Fuzzy matching algorithm for command palette
  - Flexible substring matching with scoring
  - Case-insensitive with preference for case matches

**Environment & System**:
- `envLoader.ts` - Manual .env file loading (no `dotenv` dependency)
  - Loads from current working directory
  - System environment variables take precedence
  - Lightweight alternative to external dependencies
- `terminal.ts` - Terminal utilities (clear screen, cursor control, etc.)

**CopyTree Integration**:
- `copyTreePayload.ts` - Build CopyTree payload from file selections
  - Formats file lists for CopyTree profile execution
  - Handles multiple file formats and contexts

**Performance**:
- `debounce.ts` - Debouncing utility
- `perfMetrics.ts` - Performance monitoring and metrics collection
- `changeProcessor.ts` - Batch and deduplicate file change events

**Error Handling**:
- `errorHandling.ts` - Error logging and user-friendly error messages
- `errorTypes.ts` - Custom error classes
- `logger.ts` - Structured logging

### Services

Located in `src/services/`:

**Event Bus** (`events.ts`):
- Centralized typed event bus using Node.js EventEmitter
- Type-safe event publishing and subscription
- Event categories:
  - `sys:*` - System-level events (init, shutdown, errors)
  - `nav:*` - Navigation events (move, select, open)
  - `file:*` - File operation events (open, copy, reveal)
  - `ui:*` - UI state events (modal open/close, notifications)
  - `watcher:*` - File watcher events (change, error)
  - `sys:worktree:*` - Worktree switching events
- Debug mode: Set `CANOPY_DEBUG_EVENTS=1` to log all events to stderr
- Returns unsubscribe function for cleanup in React useEffect hooks

**AI Services** (`services/ai/`):
- `client.ts` - OpenAI client singleton (requires `OPENAI_API_KEY` environment variable)
- `worktree.ts` - AI-powered worktree activity summaries
  - Uses `gpt-5-nano` model for fast, cost-effective summarization
  - Zero-context diffs (`git diff --unified=0`) for token efficiency
  - 1500 character budget with file skeletonization for new files
  - Zero-cost mode: Shows last commit message when worktree is clean
  - Resilient JSON parsing with regex fallback and manual extraction
  - Returns summary text and categorized mood (stable/active/stale/error)
- `identity.ts` - Project visual identity generation
  - Uses `gpt-5-mini` model for creative tasks
  - Generates emoji, title, and gradient colors for project branding
  - Results cached by project hash in `~/.config/canopy/identities/`
- `status.ts` - Git diff summarization
  - Uses `gpt-5-nano` for fast status updates
  - Analyzes diffs to provide human-readable change descriptions
- `cache.ts` - Project identity caching system with filesystem persistence
- `utils.ts` - OpenAI response extraction utilities (robust text parsing)

**Theme System** (`theme/`):
- `ThemeProvider.tsx` - React context provider for app-wide theming
- `colorPalette.ts` - Color palette with terminal theme detection
- `bundled/` - Bundled theme JSON files (copied to `dist/` during build)

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

**Environment Variables**:

Canopy automatically loads `.env` files from the target directory (system environment variables take precedence):

- `OPENAI_API_KEY` - **Required for AI features**
  - Enables AI-powered worktree summaries, project identity generation, and status updates
  - Without this key, Canopy falls back to default/non-AI behavior
  - Uses OpenAI API with GPT-5 model family (gpt-5-nano, gpt-5-mini)

- `CANOPY_DEBUG_EVENTS=1` - Enable event bus debugging
  - Logs all event bus activity to stderr
  - Useful for troubleshooting event flow and component communication

- `DEBUG_AI_STATUS=1` - Enable AI status debug logging
  - Shows detailed AI status generation logs
  - Helps debug AI summarization issues

- `DEBUG_IDENTITY=1` - Enable project identity debug logging
  - Shows project identity generation and caching details

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

**Navigation**:
- `Esc` - Close modals (priority: command palette → worktree panel → profile selector)

**Legacy Tree Mode**:
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
