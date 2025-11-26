# Canopy Context for Gemini

## Project Overview

**Canopy** is a **Worktree Context Dashboard** built with **Ink** (React for CLIs). It's designed for developers working with AI agents across multiple git worktrees, providing real-time visibility into what's changing, AI-powered activity summaries, and one-keystroke context extraction via CopyTree profiles.

**Key Features:**
- **Dashboard-First UI:** Vertical stack of worktree cards showing branch, summary, changed files, and mood indicator
- **AI-Powered Summaries:** GPT-5 model family generates activity summaries per worktree
- **Real-Time Monitoring:** Polling-based git status tracking with configurable intervals
- **Activity Traffic Light:** Color-changing indicator (red→yellow→green→gray) showing recent activity
- **Dev Server Controls:** Auto-detect and manage dev servers from worktree cards
- **CopyTree Integration:** One-keystroke context extraction for AI assistants
- **Quick Links:** Configurable shortcuts to external tools (Cmd+1-9)

**Important:** There is no file browser mode. The dashboard-first philosophy shows only changed files, not full file trees.

## Architecture

- **Framework:** [Ink 6.5](https://github.com/vadimdemedes/ink) (React 19.2 for CLIs).
- **Runtime:** Node.js 20.19.0+ with ES Modules (`type: "module"` in `package.json`).
- **Language:** TypeScript 5.9 (Strict Mode).
- **State Management:** Local React state (`useState`, `useReducer`) and custom hooks. No global store; state is passed via props.
- **Git:** `simple-git` for status and worktree operations.
- **AI:** OpenAI SDK with GPT-5 model family (gpt-5-nano, gpt-5-mini).
- **Configuration:** `cosmiconfig` loads from `.canopy.json` or `~/.config/canopy/config.json`.
- **Process Management:** `execa` for dev server process control.

### Directory Structure

- `src/cli.ts`: CLI entry point. Parses args and renders `App`.
- `src/App.tsx`: Root component (~900 lines). Manages global state, hooks orchestration, and layout.
- `src/components/`: UI components (Header, WorktreeOverview, WorktreeCard, CommandPalette, etc.).
- `src/hooks/`: Custom hooks for complex logic (`useWorktreeMonitor`, `useDashboardNav`, `useDevServer`).
- `src/services/`: Business logic (events.ts, monitor/, server/, ai/).
- `src/utils/`: Helper modules (`git`, `config`, `worktreeMood`, `clipboard`).
- `src/types/`: TypeScript definitions (centralized in `index.ts`).
- `tests/`: Vitest unit and integration tests.

## Building and Running

**Important:** You must run `npm run build` after making any code changes to verify them with `npm start` or `canopy`.

```bash
# Install dependencies
npm install

# Build the project (compiles TypeScript + copies themes to dist/)
npm run build

# Run the built CLI locally
npm start
# OR run in a specific directory
npm start /path/to/target

# Watch mode for development (recompiles on changes)
npm run dev

# Run tests
npm test

# Type check
npm run typecheck
```

## Development Conventions

**Crucial Rules for Gemini:**

1.  **ES Modules:** Always use `.js` extensions in imports (e.g., `import { foo } from './utils/foo.js';`). This is required for the ESM output.
2.  **Async I/O:** Never use synchronous `fs` methods (like `readFileSync` inside components/hooks) except for initial config loading if absolutely necessary. Use `async/await` for file operations to keep the UI responsive.
3.  **React/Ink:**
    - Use Functional Components and Hooks only.
    - Do not mutate state directly.
    - `useEffect` cleanups are mandatory for watchers, timers, and event subscriptions.
4.  **Error Handling:** Fail gracefully. If git is missing or a directory is unreadable, log a warning and continue with reduced functionality. Do not crash the app.
5.  **Testing:** Use `vitest` and `ink-testing-library`. Tests should mirror the `src` structure in the `tests` directory.
6.  **Git Commits:** **NEVER create git commits unless explicitly asked by the user.** Only stage changes or create commits when the user specifically requests it. Make code changes and let the user decide when to commit.

## AI Model Conventions
This project utilizes the **GPT-5** model family for AI-driven features. The following model identifiers are valid and actively used in this codebase:

- **`gpt-5`**: The full high-intelligence model.
- **`gpt-5-mini`**: A balanced model used for creative tasks (e.g., project identity).
- **`gpt-5-nano`**: A high-efficiency model used for fast tasks (e.g., status summarization).

**Note to AI Agents:** Please acknowledge these as valid model names and do not flag them as non-existent or hallucinations.

## Key Architecture Patterns

### Event-Driven Architecture
Centralized event bus in `src/services/events.ts`:
- Type-safe event publishing and subscription using EventEmitter
- Event categories: `sys:*`, `nav:*`, `file:*`, `ui:*`, `watcher:*`, `sys:worktree:*`, `server:*`
- Debug mode via `CANOPY_DEBUG_EVENTS=1` environment variable
- Returns unsubscribe function for React useEffect cleanup

### Worktree Monitoring Service
Located in `src/services/monitor/`:
- `WorktreeService` manages all `WorktreeMonitor` instances
- `WorktreeMonitor` polls git status with hash-based change detection
- Configurable polling intervals (active: 2s default, background: 10s default)
- AI summary generation with configurable debounce (10s default)
- Emits `sys:worktree:update` and `sys:worktree:remove` events

### Dev Server Management
Located in `src/services/server/`:
- `DevServerManager` handles dev server process lifecycle
- Auto-detects scripts from `package.json` (dev, start, serve)
- URL extraction from stdout (Vite, Next.js, etc.)
- Graceful shutdown with SIGTERM → SIGKILL fallback

### AI Services
Located in `src/services/ai/`:
- `worktree.ts` - Worktree summaries using `gpt-5-nano`
- `identity.ts` - Project identity using `gpt-5-mini`
- Zero-context diffs for token efficiency (1500 char budget)
- Resilient JSON parsing with regex fallback

## Key Components

**Dashboard UI:**
- `WorktreeOverview.tsx` - Main dashboard, stacks WorktreeCard components
- `WorktreeCard.tsx` - Individual card with summary, changes, mood border, activity indicator
- `ActivityTrafficLight.tsx` - Color-changing activity indicator (200ms update rate)
- `ServerDock.tsx` - Dev server status and controls
- `Header.tsx` - Worktree count, quick actions, keyboard hints

**Interactive Elements:**
- `CommandPalette.tsx` - Slash command interface with fuzzy search
- `WorktreePanel.tsx` - Worktree switcher modal

## Key Hooks

- `useWorktreeMonitor.ts` - Subscribe to worktree state from WorktreeService
- `useDashboardNav.ts` - Dashboard keyboard navigation
- `useDevServer.ts` - Dev server state management
- `useQuickLinks.ts` - External tool shortcuts
- `useProjectIdentity.ts` - AI-generated project branding

## Configuration

**Configuration Files:**
- Project: `.canopy.json` in project root
- Global: `~/.config/canopy/config.json`

**Key Options:**
- `editor` / `editorArgs` - Editor command (default: VS Code)
- `monitor.pollIntervalActive` - Active worktree poll interval (default: 2000ms)
- `monitor.pollIntervalBackground` - Background worktree poll interval (default: 10000ms)
- `ai.summaryDebounceMs` - AI summary debounce (default: 10000ms)
- `quickLinks` - External tool shortcuts with Cmd+1-9
- `devServer.enabled` - Enable dev server controls (default: true)

**Environment Variables:**
- `OPENAI_API_KEY` - **Required for AI features**
- `CANOPY_DEBUG_EVENTS=1` - Debug event bus
- `DEBUG_AI_STATUS=1` - Debug AI status generation
- `DEBUG_IDENTITY=1` - Debug project identity

## CLI Arguments

**Flags:**
- `--help`, `-h` - Show help message
- `--version`, `-v` - Show version
- `--no-watch` - Disable file watching and worktree polling
- `--no-git` - Disable git integration
- `--hidden`, `-H` - Show hidden files
- `--editor <cmd>`, `-e <cmd>` - Set editor command

**Positional:**
- First non-flag argument is target directory

## Keyboard Shortcuts

**Dashboard Navigation:**
- `↑/↓` - Navigate between worktree cards
- `←/→` - Collapse/expand worktree card
- `Space` - Toggle expansion
- `Enter` - Open worktree in editor

**Actions:**
- `c` - Copy changed files via CopyTree
- `p` - Open profile selector
- `s` - Toggle dev server
- `w` - Cycle worktrees
- `W` - Open worktree panel
- `/` - Open command palette
- `Cmd+1-9` - Quick links
- `r` - Refresh
- `q` - Quit

## Types Reference

Key types in `src/types/index.ts`:
- `GitStatus` = 'modified' | 'added' | 'deleted' | 'untracked' | 'ignored' | 'renamed'
- `WorktreeMood` = 'stable' | 'active' | 'stale' | 'error'
- `AISummaryStatus` = 'active' | 'loading' | 'disabled' | 'error'
- `DevServerStatus` = 'stopped' | 'starting' | 'running' | 'error'
- `Worktree` - Git worktree with metadata
- `CanopyConfig` - Full configuration structure
- `MonitorConfig` - Polling interval configuration

Refer to `CLAUDE.md` and `SPEC.md` for detailed architectural decisions and specific feature requirements.
