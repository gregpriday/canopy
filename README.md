# Canopy

> Your AI Agent Dashboard. Watch your AI agents work from the canopy—the highest vantage point in the forest.

**Canopy is a Worktree Context Dashboard for AI-driven development.** Monitor multiple AI agents working across git worktrees simultaneously, with one-keystroke context extraction and always-visible activity summaries.

## The Problem: Agent Blindness

When working with CLI-based AI coding agents (Claude Code, Gemini CLI, Codex, etc.), you face critical visibility gaps:

- **Which worktree is the agent touching?** When running multiple feature branches, you can't tell where changes are happening
- **What files are being modified?** Real-time file changes happen invisibly in background worktrees
- **What's the current state?** No way to glance and see all active development contexts at once
- **How do I give the agent context?** Manually building file lists or running `copytree` commands breaks flow

Running `git status` across multiple worktrees or constantly checking different directories pulls you out of the agent conversation.

## The Solution: Worktree Context Dashboard

**Canopy is your always-on context dashboard.** It sits in a narrow terminal split showing you a real-time view of all your git worktrees, their changes, and their activity state—with AI-powered summaries of what's happening in each one.

```
┌──────────────────────────────────────────────────────┐
│ Canopy • 3 worktrees                                 │
├──────────────────────────────────────────────────────┤
│ ╔══════════════════════════════════════════════════╗ │
│ ║ main • ~/canopy                         [ACTIVE] ║ │
│ ╠══════════════════════════════════════════════════╣ │
│ ║ Summary: Implementing new dashboard UI           ║ │
│ ║ 12 files • 5 modified, 3 added, 1 deleted        ║ │
│ ║                                                   ║ │
│ ║ M src/App.tsx                                    ║ │
│ ║ M src/components/WorktreeCard.tsx                ║ │
│ ║ A src/hooks/useDashboardNav.ts                   ║ │
│ ║ ... and 9 more                                   ║ │
│ ║                                                   ║ │
│ ║ [space] toggle • [c] copy • [s] server • [↵] open  │
│ ╚══════════════════════════════════════════════════╝ │
│                                                      │
│ ┌────────────────────────────────────────────────┐   │
│ │ feature/auth • ~/canopy-auth          [STABLE] │   │
│ ├────────────────────────────────────────────────┤   │
│ │ Summary: Authentication system implementation  │   │
│ │ 3 files • 2 modified, 1 added                  │   │
│ └────────────────────────────────────────────────┘   │
│                                                      │
│ ┌────────────────────────────────────────────────┐   │
│ │ bugfix/leak • ~/canopy-bugfix           [STALE] │   │
│ ├────────────────────────────────────────────────┤   │
│ │ Summary: Memory leak investigation             │   │
│ │ No changes (last activity: 3 days ago)         │   │
│ └────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────┤
│ Press ? for help • / for search                      │
└──────────────────────────────────────────────────────┘
```

### Worktree-First Philosophy

**Changed Files, Not File Systems.** Canopy doesn't show you a deep file tree—it shows you what's changing across all your worktrees. Each card displays:

- **Worktree name and branch** with activity mood indicator
- **AI-generated summary** of what's happening (e.g., "Implementing authentication")
- **Changed files only** with git status markers (M/A/D)
- **One-keystroke actions**: Copy context, open in editor

**Traditional file browsing available when needed via fuzzy search** (press `/` to search for any file across all worktrees).

## Key Features

### Multi-Worktree Awareness
See all your git worktrees at once, sorted by activity. Active worktrees appear first, followed by stable ones, then stale. Each card shows the branch, path, and current state.

### AI-Powered Summaries
Each worktree card displays an AI-generated summary of what's happening based on file changes and commit messages. Powered by **GPT-5 Nano** for high-speed status summarization and **GPT-5 Mini** for creative project identity generation. Canopy analyzes diffs using zero-context diffs for token efficiency, describing exactly *what* feature is being built, not just which files changed.

### Mood Indicators
Worktrees are automatically categorized by activity level:
- **ACTIVE** (yellow border): Has uncommitted changes
- **STABLE** (green border): Clean worktree with recent commits
- **STALE** (gray border): No recent activity (> 7 days since last commit)
- **ERROR** (red border): Git status fetch failed

### Project Identity
Each project gets a unique visual identity with AI-generated emoji and gradient colors based on the project name. This helps visually distinguish worktrees at a glance and adds personality to your dashboard.

### One-Keystroke Context Extraction
Press `c` on any worktree to copy its changed files to your clipboard via CopyTree integration. The copied context is formatted for AI agents, giving them exactly the files they need to understand your current work.

### VS Code Integration
Press `Enter` on any worktree card to open it in VS Code (or your configured editor). The editor opens in the worktree's root directory, preserving your context.

### Fuzzy Search
Press `/` to open fuzzy search and find any file across all worktrees. Search replaces the traditional file browser—use it when you need to dive deep into specific files.

### Live Updates
File watching keeps the dashboard current. As AI agents modify files, you see changes appear in real-time on the relevant worktree card—no manual refresh needed.

### Dev Server Management
Start and stop development servers directly from the dashboard. Press `s` on any worktree to toggle its dev server. Canopy auto-detects dev scripts from `package.json` and monitors server output for URLs, displaying them in the worktree card.

```
────────────────────────────────────────────────
● http://localhost:5173              [s] [■ Stop]
```

Enable in `.canopy.json`:
```json
{
  "devServer": {
    "enabled": true
  }
}
```

See [docs/DEV_SERVER.md](docs/DEV_SERVER.md) for full configuration options.

### Quick Links & Command Palette
Press `/` to open the command palette for slash commands and quick access to external tools. Configure custom links to GitHub, Linear, or any URL you use frequently.

- **Numeric shortcuts:** Press `1-9` to instantly open configured quick links
- **Command aliases:** Type `/gh` or `/linear` to jump to those URLs
- **File search:** The command palette also provides fuzzy search across all files

```json
{
  "quickLinks": {
    "enabled": true,
    "links": [
      { "label": "GitHub", "url": "https://github.com/my-org/repo", "shortcut": 1, "command": "gh" },
      { "label": "Linear", "url": "https://linear.app/team", "shortcut": 2, "command": "linear" },
      { "label": "Localhost", "url": "http://localhost:3000", "shortcut": 3 }
    ]
  }
}
```

## Installation

```bash
npm install -g @gpriday/canopy
```

### Recommended Setup

**Ghostty Users:** Create a split layout with Canopy in the left pane:
1. Launch Ghostty
2. Split vertically (Cmd+D or Ctrl+Shift+\)
3. In the left pane: `canopy`
4. Resize to ~60-80 columns wide
5. Save the layout for future sessions

**tmux Users:** Add to your `.tmux.conf`:
```bash
bind C-c split-window -h -l 70 "canopy"
```

**General:** Launch Canopy in any narrow terminal split alongside your AI agent's workspace.

## Usage

```bash
# Run in current directory
canopy

# Run in specific directory
canopy /path/to/project

# Disable file watching (for very large projects)
canopy --no-watch

# Disable git integration
canopy --no-git
```

### Keyboard Shortcuts

**Dashboard Navigation:**
- `↑/↓` - Navigate worktree cards
- `Space` - Expand/collapse card to see changed files
- `PageUp/PageDown` - Page navigation
- `Home/End` - Jump to first/last worktree

**Worktree Actions:**
- `c` - Copy changed files via CopyTree
- `s` - Toggle dev server (start/stop)
- `Enter` - Open worktree in VS Code/editor
- `w` - Cycle to next worktree
- `W` - Open worktree panel (full list)

**Search & Commands:**
- `/` - Open command palette (slash commands and fuzzy search)
- `1-9` - Open quick links by shortcut number
- `Ctrl+F` - Quick filter
- `Esc` - Close modals/search

**Other:**
- `g` - Toggle git status visibility
- `r` - Manual refresh
- `q` - Quit

### Traditional File Tree Mode

Need to browse the full file hierarchy? The original tree view is available via the `/tree` command. This provides the traditional collapsible folder view when you need deep file exploration.

## Configuration

Create a `.canopy.json` file in your project root or `~/.config/canopy/config.json` for global settings.

```json
{
  "editor": "code",
  "editorArgs": ["-r"],
  "showGitStatus": true,
  "refreshDebounce": 100,
  "devServer": {
    "enabled": true,
    "autoStart": false,
    "command": "npm run dev"
  },
  "quickLinks": {
    "enabled": true,
    "links": [
      { "label": "GitHub", "url": "https://github.com/my-org/repo", "shortcut": 1, "command": "gh" },
      { "label": "Linear", "url": "https://linear.app/", "shortcut": 2, "command": "linear" },
      { "label": "Localhost", "url": "http://localhost:3000", "shortcut": 3 }
    ]
  },
  "ui": {
    "compactMode": true,
    "activePathHighlight": true
  }
}
```

### Configuration Options

- **`editor`** - Command to open files (default: `code`)
- **`editorArgs`** - Arguments for the editor (default: `["-r"]`)
- **`showGitStatus`** - Display git status indicators (default: `true`)
- **`refreshDebounce`** - File watcher debounce in ms (default: `100`)
- **`ui.compactMode`** - Compact display mode (default: `true`)
- **`ui.activePathHighlight`** - Highlight active path (default: `true`)
- **`devServer.enabled`** - Enable dev server management (default: `false`)
- **`devServer.command`** - Custom dev server command (default: auto-detect from package.json)
- **`devServer.autoStart`** - Auto-start servers on launch (default: `false`)
- **`quickLinks.enabled`** - Enable quick links feature (default: `true`)
- **`quickLinks.links`** - Array of link objects with `label`, `url`, optional `shortcut` (1-9), and optional `command`

See [docs/DEV_SERVER.md](docs/DEV_SERVER.md) for dev server configuration.

## Why This Matters

### Solves Agent Blindness
No more wondering "what's the agent doing?" Just glance left and see exactly which worktree is active and what files are changing.

### Context Switching Made Effortless
Jump between agent tasks instantly. See all your feature branches, experiments, and bug fixes in one view with their current activity state.

### One-Keystroke AI Context
Stop manually building file lists for your AI prompts. Press `c` to copy a pre-configured context packet with exactly the files you need.

### Multi-Agent Coordination
When multiple AI agents work across different worktrees, Canopy shows you the full picture—who's touching what, where changes are happening, and what's the current state.

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Watch mode
npm run dev

# Run locally
npm start

# Run tests
npm test

# Type checking
npm run typecheck
```

**Important:** You must run `npm run build` after making code changes to verify them with `npm start` or `canopy`.

## Documentation

- **[SPEC.md](SPEC.md)** - Complete technical specification and architecture
- **[CLAUDE.md](CLAUDE.md)** - AI agent development instructions
- **[docs/KEYBOARD_SHORTCUTS.md](docs/KEYBOARD_SHORTCUTS.md)** - Full keyboard reference
- **[docs/DEV_SERVER.md](docs/DEV_SERVER.md)** - Dev server management and configuration

## License

MIT
