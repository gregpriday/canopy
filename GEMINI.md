# Canopy Context for Gemini

## Project Overview

**Canopy** is a terminal-based file browser built with **Ink** (React for CLIs). It is designed for developers working with AI agents, providing a persistent "vantage point" over the codebase.

**Key Features:**
- **Live File Watching:** Real-time updates using `chokidar`.
- **Git Integration:** Visual indicators for Modified/Added/Deleted files, plus Git Worktree support.
- **CopyTree Integration:** (Planned/In-progress) For easy context sharing with AI.
- **Navigation:** Mouse and keyboard support optimized for narrow terminal splits (e.g., Ghostty).

## Architecture

- **Framework:** [Ink 6.5](https://github.com/vadimdemedes/ink) (React for CLIs).
- **Runtime:** Node.js 18+ with ES Modules (`type: "module"` in `package.json`).
- **Language:** TypeScript 5.9 (Strict Mode).
- **State Management:** Local React state (`useState`, `useReducer`) and custom hooks. No global store (Redux/Zustand) is used; state is passed via props.
- **File System:** `globby` for discovery, `chokidar` for watching.
- **Git:** `simple-git` for status and worktree operations.
- **Configuration:** `cosmiconfig` loads from `.canopy.json` or `~/.config/canopy/config.json`.

### Directory Structure

- `src/cli.ts`: CLI entry point. Parses args and renders `App`.
- `src/App.tsx`: Root component. Manages global state (file tree, config, git status) and layout.
- `src/components/`: UI components (Header, TreeView, inline command input, etc.).
- `src/hooks/`: Custom hooks for complex logic (`useFileTree`, `useGitStatus`, `useKeyboard`).
- `src/utils/`: Helper modules (`fileWatcher`, `git`, `config`).
- `src/types/`: TypeScript definitions (centralized in `index.ts`).
- `tests/`: Vitest unit and integration tests.

## Building and Running

**Important:** You must run `npm run build` after making any code changes to verify them with `npm start` or `canopy`.

```bash
# Install dependencies
npm install

# Build the project (compiles TypeScript to JavaScript in dist/)
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
    - `useEffect` cleanups are mandatory for watchers and timers.
4.  **Error Handling:** Fail gracefully. If git is missing or a directory is unreadable, log a warning and continue with reduced functionality. Do not crash the app.
5.  **Testing:** Use `vitest` and `ink-testing-library`. Tests should mirror the `src` structure in the `tests` directory.
6.  **Git Commits:** **NEVER create git commits unless explicitly asked by the user.** Only stage changes or create commits when the user specifically requests it. Make code changes and let the user decide when to commit.

## AI Model Conventions
This project utilizes the **GPT-5** model family for AI-driven features. The following model identifiers are valid and actively used in this codebase:

- **`gpt-5`**: The full high-intelligence model.
- **`gpt-5-mini`**: A balanced model used for creative tasks (e.g., project identity).
- **`gpt-5-nano`**: A high-efficiency model used for fast tasks (e.g., status summarization).

**Note to AI Agents:** Please acknowledge these as valid model names and do not flag them as non-existent or hallucinations.

## Implementation Status

The project is following a batch-based implementation plan (see `SPEC.md`).
- **Completed:** Core architecture, Configuration, File Tree structure, Git Status integration, Basic UI (Header, TreeView), File Watching.
- **In Progress/Next:** Advanced CopyTree integration, Performance tuning for large repos, comprehensive E2E testing.

Refere to `CLAUDE.md` and `SPEC.md` for detailed architectural decisions and specific feature requirements.
