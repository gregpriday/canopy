# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Canopy is a **Worktree Context Dashboard** built with Ink (React for CLIs). It's designed for developers working with AI agents across multiple git worktrees, providing real-time visibility into what's changing, AI-powered activity summaries, and one-keystroke context extraction via CopyTree profiles. Named after South Africa's tallest indigenous tree, symbolizing oversight and observation.

### Core Concept: Dashboard First, Not File Browser

**Canopy displays worktrees, not deep file trees.** The primary interface is a vertical stack of **Worktree Cards**, each showing:
- Branch name and path
- AI-generated summary of current activity
- Changed files (only what's modified/added/deleted—not entire file trees)
- Activity mood indicator (active/stable/stale/error)
- Real-time activity traffic light (color transitions: red→yellow→green→gray)
- Dev server controls (when detected)
- One-keystroke actions: CopyTree, profile selector, editor launch

**There is no file browser mode.** The dashboard-first philosophy prevents cognitive overload in multi-worktree scenarios.

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
# Build the project (compiles TypeScript + copies themes to dist/)
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
- **UI Framework**: Ink 6.5 (React 19.2 for terminal UIs)
- **Language**: TypeScript 5.9 with strict mode
- **Testing**: Vitest with @testing-library/react
- **Git Integration**: simple-git
- **AI**: OpenAI SDK (gpt-5 model family)
- **Configuration**: cosmiconfig
- **Process Management**: execa (for dev servers)

### Entry Points
- `src/cli.ts` - CLI entry point with shebang, parses arguments and flags
- `src/index.ts` - Main module export
- `src/App.tsx` - Root React component (~900 lines) with error boundary

### Module System

Uses ES modules with `.js` extensions in imports (TypeScript compilation target). All source files use `.ts`/`.tsx` but import with `.js` extensions for ESM compatibility.

### Key Design Patterns

1. **Application Lifecycle**: The `useAppLifecycle` hook orchestrates initialization:
   - Configuration loading via cosmiconfig (project `.canopy.json` → global `~/.config/canopy/config.json` → `DEFAULT_CONFIG`)
   - Git worktree discovery using `git worktree list --porcelain`
   - Session state restoration (selected path, expanded folders) from `~/.config/canopy/sessions/`
   - Error handling and recovery

2. **Event-Driven Architecture**: Centralized event bus in `src/services/events.ts`:
   - Type-safe event publishing and subscription using EventEmitter
   - Event categories: `sys:*`, `nav:*`, `file:*`, `ui:*`, `watcher:*`, `sys:worktree:*`, `server:*`
   - Enables decoupled communication between components and services
   - Debug mode via `CANOPY_DEBUG_EVENTS=1` environment variable
   - Returns unsubscribe function for React useEffect cleanup

3. **Worktree Monitoring Service**: Real-time git status tracking:
   - `WorktreeService` manages all `WorktreeMonitor` instances
   - Configurable polling intervals (active: 2s default, background: 10s default)
   - Hash-based change detection to minimize recalculations
   - AI summary generation with configurable debounce (10s default)
   - Respects `--no-watch` flag to disable polling
   - Emits `sys:worktree:update` and `sys:worktree:remove` events

4. **Git Integration**:
   - **Git Status**: Tracked via `WorktreeMonitor` service which polls `git status` periodically
   - **Worktrees**: Full git worktree support with detection, switching, and session persistence
   - Uses polling (not filesystem watching) for accurate git state across networked filesystems
   - Can be disabled with `--no-git` CLI flag

5. **Session Persistence**: Per-worktree state saved to `~/.config/canopy/sessions/`:
   - Stores last used CopyTree profile
   - Automatically saved on worktree switch and app exit
   - Sessions expire after 30 days
   - Worktree ID is normalized absolute path

6. **AI-Powered Summaries**: Intelligent worktree activity summaries using GPT models:
   - Zero-cost mode for clean worktrees (displays last commit message)
   - Zero-context diffs (`git diff --unified=0`) for token efficiency (1500 character budget)
   - Configurable debounce with immediate updates on dirty→clean transitions
   - File skeletonization for new files (structure without full content)
   - Resilient JSON parsing with multiple fallback strategies
   - Worktree mood categorization: stable, active, stale, or error
   - Visual AI status indicators: active, loading, disabled, error

7. **Dev Server Management**: Automatic dev server detection and control:
   - `DevServerManager` service handles process lifecycle
   - Auto-detects scripts from `package.json` (dev, start, serve)
   - URL extraction from stdout (Vite, Next.js, etc.)
   - Graceful shutdown with SIGTERM → SIGKILL fallback
   - Visual controls in worktree cards

8. **Performance Optimizations**:
   - Render FPS capped at 10 to prevent terminal aliasing
   - Directory listing cache with TTL and LRU eviction
   - Git status caching with configurable debounce
   - Activity traffic light CPU optimization (high-frequency updates only within 90s window)
   - AI debounce to prevent excessive API calls
   - Memoized tree filtering and git status attachment

### Type System

All types centralized in `src/types/index.ts`:
- `TreeNode` - Hierarchical file/folder structure with git status, expansion state
- `CanopyConfig` - User configuration (editor, git settings, display options, openers, CopyTree defaults)
- `GitStatus` - Git file status: `modified | added | deleted | untracked | ignored | renamed`
- `Notification` - User notifications: `info | success | error | warning`
- `Worktree` - Git worktree metadata (id, path, name, branch, isCurrent, summary, mood)
- `WorktreeChanges` - File-level change details for a worktree
- `FileChangeDetail` - Individual file change metadata (status, insertions, deletions, mtime)
- `WorktreeMood` - Worktree categorization: `'stable' | 'active' | 'stale' | 'error'`
- `AISummaryStatus` - AI status: `'active' | 'loading' | 'disabled' | 'error'`
- `DevServerState` - Dev server state (status, url, port, pid, logs)
- `QuickLink` / `QuickLinksConfig` - External tool shortcuts
- `MonitorConfig` - Polling interval configuration

Additional type modules in `src/types/`:
- `keymap.ts` - Keyboard mapping types and shortcut definitions

### Component Architecture

Components in `src/components/` follow Ink's React-based model:

**Dashboard UI (Primary Interface)**:
- `App.tsx` - Root component orchestrating all state and hooks
- `AppErrorBoundary.tsx` - Top-level error boundary for graceful failure
- `Header.tsx` - Shows worktree count, quick action buttons, and keyboard hints
- `WorktreeOverview.tsx` - Main dashboard renderer, stacks WorktreeCard components
- `WorktreeCard.tsx` - Individual worktree card with summary, changes, mood border, activity traffic light, server dock
- `ActivityTrafficLight.tsx` - Real-time color-changing activity indicator (red→yellow→green→gray)
- `ServerDock.tsx` - Dev server status indicator and start/stop controls

**Interactive Elements**:
- `CommandPalette.tsx` - Slash command interface with fuzzy search (`/` key)
- `WorktreePanel.tsx` - Worktree switcher modal (`W` key)
- `Notification.tsx` - Toast-style notifications (info/success/error/warning)

**Design Principles**:
- **Dashboard-first**: WorktreeOverview is the only view (no file browser)
- Components receive minimal props (prefer passing config/state from App)
- UI state managed in `App.tsx`, domain logic in hooks/utils
- Keyboard handling centralized in `useDashboardNav` hook
- Modal state controls keyboard handler disabling (`anyModalOpen` flag)

### Custom Hooks

Located in `src/hooks/`:

**Dashboard Hooks** (primary):
- `useDashboardNav.ts` - Dashboard navigation (arrow keys, Home/End, page up/down), expansion toggles, CopyTree shortcuts, server controls
- `useKeyboard.ts` - Centralized keyboard input handling with modal awareness
- `useCopyTree.ts` - CopyTree profile execution, event bus integration, success/error feedback

**Worktree Management**:
- `useWorktreeMonitor.ts` - **Primary hook** for accessing worktree state
  - Subscribes to `sys:worktree:update` and `sys:worktree:remove` events from WorktreeService
  - Returns `Map<string, WorktreeState>` with complete worktree information
  - Event-driven architecture (no polling in the hook itself)
  - Race condition safe initialization

**AI & Identity**:
- `useProjectIdentity.ts` - Project identity with AI generation and caching
  - Fetches/generates emoji, title, and gradient colors
  - Caches results by project hash in `~/.config/canopy/identities/`
  - Falls back to default identity if `OPENAI_API_KEY` not set

**Dev Server & External**:
- `useDevServer.ts` - Manage dev server state for a worktree
  - Returns: state, start/stop/toggle functions, hasDevScript flag, logs
  - Subscribes to `server:update` events from `DevServerManager`
- `useQuickLinks.ts` - Manage quick links to external tools/chat clients
  - URL opening, command palette integration, keyboard shortcuts (Cmd+1-9)

**Core Infrastructure**:
- `useAppLifecycle.ts` - Application initialization and lifecycle management
- `useRepositoryStats.ts` - GitHub repo stats with adaptive polling (30s active, 5min idle)

### Utilities

Located in `src/utils/`:

**Configuration & State**:
- `config.ts` - Configuration loading via cosmiconfig with defaults
- `state.ts` - Session state persistence
- `cache.ts` - Generic TTL-based cache with LRU eviction
- `envLoader.ts` - Manual .env file loading (no external dependency)

**Git Operations**:
- `git.ts` - Git status fetching via `simple-git`
- `worktree.ts` - Git worktree discovery and parsing
- `gitIndicators.tsx` - Git status glyph rendering (M/A/D/R/?/·)

**File Operations**:
- `fileOpener.ts` - Open files in configured editor
- `clipboard.ts` - Copy file paths to clipboard
- `github.ts` - GitHub integration (repo stats, URL construction)

**Navigation & UI**:
- `mouseInput.ts` - Mouse event handling
- `keyMatcher.ts` - Keyboard shortcut matching
- `keyPresets.ts` - Keyboard preset configurations
- `keySequences.ts` - Home/End key escape sequences (terminal support)

**Mood & Styling**:
- `worktreeMood.ts` - Categorize worktrees: stable/active/stale/error
- `moodColors.ts` - Map mood to border colors
- `colorInterpolation.ts` - Activity traffic light heat colors
- `nodeStyling.ts` - Visual styling utilities

**Search & Matching**:
- `fuzzyMatch.ts` - Fuzzy string matching for command palette

**Logging & Error Handling**:
- `logger.ts` - Structured logging (logInfo, logWarn, logError, logDebug)
- `errorHandling.ts` - Error logging and retry logic
- `errorTypes.ts` - Custom error classes

**Performance**:
- `perfMetrics.ts` - Performance monitoring
- `time.ts` - Time formatting utilities

### Services

Located in `src/services/`:

**Event Bus** (`events.ts`):
- Centralized typed event bus using Node.js EventEmitter
- Type-safe event publishing and subscription
- Event categories:
  - `sys:*` - System events (init, shutdown, errors)
  - `nav:*` - Navigation events
  - `file:*` - File operations
  - `ui:*` - UI state (notifications, modals)
  - `watcher:*` - File watcher events
  - `sys:worktree:*` - Worktree updates
  - `server:*` - Dev server updates
- Debug mode: Set `CANOPY_DEBUG_EVENTS=1` to log all events

**Worktree Monitoring** (`services/monitor/`):
- `WorktreeMonitor.ts` - Monitor a single git worktree
  - Polling for git status changes with hash-based change detection
  - AI summary generation with configurable debounce
  - Activity tracking and mood categorization
  - Respects `--no-watch` flag
- `WorktreeService.ts` - Manage all `WorktreeMonitor` instances
  - Create/destroy monitors as worktrees change
  - Configurable polling intervals (active vs background)
  - Forward updates to event bus

**Dev Server** (`services/server/`):
- `DevServerManager.ts` - Manage dev server processes
  - Start/stop dev servers per worktree
  - URL detection from stdout
  - Cross-platform process cleanup (execa)
  - Graceful shutdown (SIGTERM → SIGKILL fallback)

**AI Services** (`services/ai/`):
- `client.ts` - OpenAI client singleton (requires `OPENAI_API_KEY`)
- `worktree.ts` - AI-powered worktree activity summaries
  - Uses `gpt-5-nano` model for fast, cost-effective summarization
  - Zero-context diffs for token efficiency
  - Zero-cost mode: Shows last commit when worktree is clean
  - Resilient JSON parsing with regex fallback
- `identity.ts` - Project visual identity generation
  - Uses `gpt-5-mini` for creative tasks
  - Results cached in `~/.config/canopy/identities/`

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
- `theme` - 'auto' | 'dark' | 'light'
- `showGitStatus` - Display git status indicators (default: true)
- `showHidden` - Show hidden files (default: false)
- `respectGitignore` - Respect .gitignore patterns (default: true)
- `customIgnores` - Additional glob patterns to ignore
- `monitor.pollIntervalActive` - Active worktree poll interval in ms (default: 2000, min: 500, max: 60000)
- `monitor.pollIntervalBackground` - Background worktree poll interval (default: 10000, min: 5000, max: 300000)
- `ai.summaryDebounceMs` - AI summary debounce in ms (default: 10000, min: 1000, max: 60000)
- `quickLinks` - External tool shortcuts with Cmd+1-9 keyboard shortcuts
- `devServer.enabled` - Enable dev server controls (default: true)
- `devServer.autoStart` - Auto-start dev servers (default: false)
- `git.statusStyle` - 'letter' (M/A/D) or 'glyph' (● markers)

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
- `--no-watch` - Disable file watching and worktree polling
- `--no-git` - Disable git integration
- `--hidden`, `-H` - Show hidden files
- `--git`, `-g` - Enable git status (overrides `--no-git`)
- `--editor <cmd>`, `-e <cmd>` - Set editor command

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

**Dashboard Navigation**:
- `↑/↓` - Navigate between worktree cards
- `←/→` - Collapse/expand worktree card
- `Space` - Toggle expansion
- `PageUp/PageDown` - Page navigation through worktree stack
- `Home/End` - Jump to first/last worktree
- `Enter` - Open worktree in VS Code/configured editor

**Worktree Actions**:
- `c` - Copy changed files via CopyTree (default profile)
- `p` - Open CopyTree profile selector modal
- `s` - Toggle dev server (when script detected)
- `w` - Cycle to next worktree
- `W` - Open worktree panel (full list)

**Global**:
- `/` - Open command palette (fuzzy search)
- `Esc` - Close modals (priority: command palette → worktree panel)
- `Cmd+1-9` - Open quick links by shortcut number
- `r` - Manual refresh
- `q` - Quit

### Error Handling Strategy

- **Lifecycle errors**: Display error screen with message, allow user to exit
- **File watcher errors**: Show warning notification, continue without watching
- **Git errors**: Gracefully degrade (empty worktree list, no status markers)
- **Config errors**: Use defaults, show warning notification
- **Session load errors**: Ignore and use default state
- **File operation errors**: Show error notification, don't crash
- **AI errors**: Show fallback text (last commit or default), continue with degraded features
