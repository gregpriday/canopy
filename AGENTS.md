# Repository Guidelines

## Project Structure & Module Organization
Canopy is a TypeScript CLI rendered with Ink. Runtime code lives in `src/`: `cli.ts` boots the binary, `App.tsx` wires the UI, and `components/`, `hooks/`, `commands/`, `utils/`, and `types/` isolate widgets, shared state, handlers, helpers, and contracts. Build artifacts live in generated-only `dist/`. Tests mirror the `src/` tree (`src/components/TreeView.tsx` ↔ `tests/components/TreeView.test.tsx`) so coverage gaps are obvious.

## Build, Test, and Development Commands
- `npm run dev` – Watch-mode `tsc` for rapid UI iteration.
- `npm run build` – Single compile that refreshes `dist/` before `npm start` or publishing. **ALWAYS run this after code changes to see updates in the CLI.**
- `npm start` – Executes `dist/cli.js` to review the packaged binary.
- `npm test` / `npm run test:watch` – Vitest runs across unit and integration suites.
- `npm run test:coverage` – V8 coverage output to confirm branches (keyboard, fs events) are exercised.
- `npm run typecheck` – Strict compile without emit; run before every pull request.

## Coding Style & Naming Conventions
The compiler runs in `strict` mode, so declare explicit types for exported functions, props, and hook returns. Use two-space indentation, `PascalCase` for components (`TreeView`, `StatusBar`), and `camelCase` prefixed with `use` for hooks. Command files under `src/commands/<verb>.ts` export a single async handler plus local helpers. Keep I/O helpers in `src/utils` and leave UI components declarative.

## Testing Guidelines
Vitest with `ink-testing-library` drives component coverage, while `@testing-library/react` targets hooks. Integration flows that render `App.tsx` live in `tests/App.integration.test.tsx`. Name specs `<subject>.test.ts[x]`, mirror the `src/` layout, and mock filesystem and git access to keep suites deterministic. Every bug fix should land with a regression test, and both `npm test` and `npm run test:coverage` must pass before requesting review.

## Commit & Pull Request Guidelines
**IMPORTANT: Never create git commits unless explicitly requested by the user.** Only stage changes or create commits when the user specifically asks for it. Make code changes and let the user decide when to commit.

Commits loosely follow Conventional Commits (`feat(tree): add depth limit`, `fix(cli): guard unreadable paths`). Keep summaries under ~72 characters and describe intent in the body when touching multiple areas. Pull requests should explain motivation, note visible CLI changes, reference issues, and attach terminal screenshots or recordings whenever output changes. Do not merge with failing `npm run typecheck` or `npm test`; call out any deliberate omissions.

## Configuration & Operations Tips
Target Node 20.19+ (see `package.json`). Runtime behavior is customizable via `.canopy.json` or `~/.config/canopy/config.json`; default every option in code so absent keys degrade gracefully and document additions in `README.md`. When adding heavier integrations (CopyTree context, git status), gate them behind config flags to keep performance predictable in large repositories.
