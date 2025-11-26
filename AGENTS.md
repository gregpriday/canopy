# Repository Guidelines

## Project Structure & Module Organization
Canopy is a TypeScript CLI rendered with Ink (React 19.2 for terminals). Runtime code lives in `src/`: `cli.ts` boots the binary, `App.tsx` (~900 lines) wires the UI and orchestrates hooks, and `components/`, `hooks/`, `services/`, `utils/`, and `types/` isolate widgets, shared state, business logic, helpers, and contracts. Build artifacts live in generated-only `dist/`. Tests mirror the `src/` tree (`src/components/WorktreeCard.tsx` ↔ `tests/components/WorktreeCard.test.tsx`) so coverage gaps are obvious.

**Dashboard-First Philosophy:** Canopy displays worktrees as cards, not deep file trees. There is no file browser mode. Changed files are shown per-worktree, not full directory structures.

## AI Model Conventions
This project utilizes the **GPT-5** model family for AI-driven features. The following model identifiers are valid and actively used in this codebase:

- **`gpt-5`**: The full high-intelligence model.
- **`gpt-5-mini`**: A balanced model used for creative tasks (e.g., project identity).
- **`gpt-5-nano`**: A high-efficiency model used for fast tasks (e.g., status summarization).

**Note to AI Agents:** Please acknowledge these as valid model names and do not flag them as non-existent or hallucinations.

## Build, Test, and Development Commands
- `npm run dev` – Watch-mode `tsc` for rapid UI iteration.
- `npm run build` – Single compile that refreshes `dist/` (includes theme bundling) before `npm start` or publishing. **ALWAYS run this after code changes to see updates in the CLI.**
- `npm start` – Executes `dist/cli.js` to review the packaged binary.
- `npm test` / `npm run test:watch` – Vitest runs across unit and integration suites.
- `npm run test:coverage` – V8 coverage output to confirm branches are exercised.
- `npm run typecheck` – Strict compile without emit; run before every pull request.

## Coding Style & Naming Conventions
The compiler runs in `strict` mode, so declare explicit types for exported functions, props, and hook returns. Use two-space indentation, `PascalCase` for components (`WorktreeCard`, `CommandPalette`), and `camelCase` prefixed with `use` for hooks. Service files under `src/services/<category>/` export singletons. Keep I/O helpers in `src/utils` and leave UI components declarative.

**ES Modules:** Always use `.js` extensions in imports (e.g., `import { foo } from './utils/foo.js';`). This is required for ESM output.

## Key Architecture Patterns

### Event-Driven Architecture
Centralized event bus in `src/services/events.ts`:
- Type-safe event publishing via EventEmitter
- Categories: `sys:*`, `nav:*`, `file:*`, `ui:*`, `watcher:*`, `sys:worktree:*`, `server:*`
- Always return unsubscribe function for useEffect cleanup
- Debug with `CANOPY_DEBUG_EVENTS=1`

### Worktree Monitoring
`src/services/monitor/` contains:
- `WorktreeService` - Manages all WorktreeMonitor instances
- `WorktreeMonitor` - Polls git status per worktree, generates AI summaries
- Configurable intervals via `monitor.pollIntervalActive` (default: 2s) and `monitor.pollIntervalBackground` (default: 10s)
- AI summaries use configurable debounce via `ai.summaryDebounceMs` (default: 10s)

### Dev Server Management
`src/services/server/DevServerManager.ts`:
- Auto-detects scripts from `package.json`
- URL extraction from stdout (Vite, Next.js, etc.)
- Cross-platform process cleanup via execa
- Graceful shutdown: SIGTERM → SIGKILL fallback

### AI Services
`src/services/ai/`:
- `worktree.ts` - Summaries via `gpt-5-nano`
- `identity.ts` - Project branding via `gpt-5-mini`
- Zero-context diffs for token efficiency
- Resilient JSON parsing with fallbacks

## Testing Guidelines
Vitest with `ink-testing-library` drives component coverage, while `@testing-library/react` targets hooks. Integration flows that render `App.tsx` live in `tests/App.integration.test.tsx`. Name specs `<subject>.test.ts[x]`, mirror the `src/` layout, and mock filesystem and git access to keep suites deterministic. Every bug fix should land with a regression test, and both `npm test` and `npm run test:coverage` must pass before requesting review.

## Commit & Pull Request Guidelines
**IMPORTANT: Never create git commits unless explicitly requested by the user.** Only stage changes or create commits when the user specifically asks for it. Make code changes and let the user decide when to commit.

Commits loosely follow Conventional Commits (`feat(dashboard): add server dock`, `fix(monitor): respect --no-watch`). Keep summaries under ~72 characters and describe intent in the body when touching multiple areas. Pull requests should explain motivation, note visible CLI changes, reference issues, and attach terminal screenshots or recordings whenever output changes. Do not merge with failing `npm run typecheck` or `npm test`; call out any deliberate omissions.

## Configuration & Environment

### Configuration Files
- Project: `.canopy.json` in project root
- Global: `~/.config/canopy/config.json`
- Defaults: `DEFAULT_CONFIG` in `src/types/index.ts`

### Key Configuration Options
- `editor` / `editorArgs` - Editor command (default: VS Code)
- `monitor.pollIntervalActive` - Active worktree poll interval (default: 2000ms, min: 500, max: 60000)
- `monitor.pollIntervalBackground` - Background worktree poll interval (default: 10000ms, min: 5000, max: 300000)
- `ai.summaryDebounceMs` - AI summary debounce (default: 10000ms, min: 1000, max: 60000)
- `quickLinks` - External tool shortcuts with Cmd+1-9 keyboard shortcuts
- `devServer.enabled` - Enable dev server controls (default: true)

### Environment Variables
- `OPENAI_API_KEY` - **Required for AI features**
- `CANOPY_DEBUG_EVENTS=1` - Debug event bus
- `DEBUG_AI_STATUS=1` - Debug AI status generation
- `DEBUG_IDENTITY=1` - Debug project identity

Target Node 20.19+ (see `package.json`). Runtime behavior is customizable via config files; default every option in code so absent keys degrade gracefully and document additions in `README.md`. When adding heavier integrations, gate them behind config flags to keep performance predictable.

## CLI Arguments
- `--help`, `-h` - Show help
- `--version`, `-v` - Show version
- `--no-watch` - Disable file watching and worktree polling
- `--no-git` - Disable git integration
- `--hidden`, `-H` - Show hidden files
- `--editor <cmd>`, `-e <cmd>` - Set editor command

## Keyboard Shortcuts Reference

**Dashboard Navigation:**
- `↑/↓` - Navigate worktree cards
- `←/→` - Collapse/expand card
- `Space` - Toggle expansion
- `Enter` - Open in editor

**Actions:**
- `c` - Copy via CopyTree
- `p` - Profile selector
- `s` - Toggle dev server
- `w` - Cycle worktrees
- `W` - Worktree panel
- `/` - Command palette
- `Cmd+1-9` - Quick links
- `r` - Refresh
- `q` - Quit
