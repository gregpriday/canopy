# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yellowwood is a terminal-based file browser built with Ink (React for CLIs). It's designed for developers working with AI agents, providing features like live file watching, git integration, and CopyTree integration for easy AI context sharing. Named after South Africa's tallest indigenous tree, symbolizing oversight and observation.

## Build Commands

```bash
# Build the project (compiles TypeScript to JavaScript)
npm run build

# Watch mode for development (recompiles on changes)
npm run dev

# Type checking without emitting files
npm run typecheck

# Run the built CLI locally
npm start

# Run in specific directory
npm start /path/to/directory
```

## Architecture

### Technology Stack
- **Runtime**: Node.js 18+ with ES modules
- **UI Framework**: Ink 6.5 (React for terminal UIs)
- **Language**: TypeScript with strict mode
- **File Watching**: Chokidar
- **Git Integration**: simple-git
- **Configuration**: cosmiconfig

### Entry Points
- `src/cli.ts` - CLI entry point with shebang, parses directory argument
- `src/index.ts` - Main module export
- `src/App.tsx` - Root React component

### Component Structure

The UI is composed of Ink/React components in `src/components/`:
- `Header.tsx` - Displays current directory and filter status
- `TreeView.tsx` - Main tree view container (mostly stub currently)
- `TreeNode.tsx` - Individual tree node renderer (empty stub)
- `FileNode.tsx` - File-specific node renderer (empty stub)
- `FolderNode.tsx` - Folder-specific node renderer (empty stub)
- `StatusBar.tsx` - Bottom status bar with file counts and notifications
- `SearchBar.tsx` - Search/filter input (empty stub)
- `PreviewPane.tsx` - Optional file preview (empty stub)
- `ContextMenu.tsx` - Right-click context menu (empty stub)
- `HelpModal.tsx` - Help overlay (empty stub)

### Custom Hooks (Currently Stubs)

Located in `src/hooks/`:
- `useFileTree.ts` - File tree state management
- `useKeyboard.ts` - Keyboard input handling
- `useGitStatus.ts` - Git status tracking

### Utilities (Currently Stubs)

Located in `src/utils/`:
- `fileWatcher.ts` - Chokidar-based file system watching
- `git.ts` - Git operations via simple-git
- `config.ts` - Configuration loading via cosmiconfig

### Type System

All types are centralized in `src/types/index.ts`:
- `TreeNode` - Hierarchical file/folder structure with git status, expansion state
- `YellowwoodConfig` - User configuration (editor, git settings, display options, CopyTree defaults)
- `YellowwoodState` - Application state (tree, selection, UI modes)
- `GitStatus` - Git file status types (modified, added, deleted, untracked, ignored)
- `Notification` - User notifications (info, success, error, warning)

### Key Design Patterns

1. **State Management**: React useState/useEffect for component state; custom hooks planned for complex state logic
2. **File System Operations**: Globby for file discovery, respects gitignore when configured
3. **Configuration Cascade**: Project `.yellowwood.json` → Global `~/.config/yellowwood/config.json` → DEFAULT_CONFIG
4. **Live Updates**: Chokidar watches for file changes with debounced updates (100ms default)
5. **Git Integration**: Optional git status overlay on tree view

### Current Implementation Status

This is an early-stage project. Core structure is defined but many components and utilities are empty stubs. The main `App.tsx` has TODOs for:
- Loading configuration from cosmiconfig
- Building initial file tree
- Setting up file watcher

Most hooks, utilities, and several components need implementation.

## Configuration

Users can configure Yellowwood via:
- Project: `.yellowwood.json` in project root
- Global: `~/.config/yellowwood/config.json`

Key configuration options (see `YellowwoodConfig` type):
- `editor`: Command to open files (default: "code")
- `showGitStatus`: Display git status indicators (default: true)
- `showHidden`: Show hidden files (default: false)
- `respectGitignore`: Respect .gitignore patterns (default: true)
- `copytreeDefaults`: Default format and options for CopyTree integration
- `treeIndent`: Indentation level for tree display (default: 2)
- `sortBy`: File sorting method (name, size, modified, type)

## Module System

Uses ES modules with `.js` extensions in imports (TypeScript compilation target). All source files use `.ts`/`.tsx` but import with `.js` extensions for ESM compatibility.
