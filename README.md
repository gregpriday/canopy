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
│ ║ [space] toggle • [c] copy • [p] profile • [↵] open │
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
- **One-keystroke actions**: CopyTree context, profile selector, editor launch

**Traditional file browsing available when needed via fuzzy search** (press `/` to search for any file across all worktrees).

## Key Features

### Multi-Worktree Awareness
See all your git worktrees at once, sorted by activity. Active worktrees appear first, followed by stable ones, then stale. Each card shows the branch, path, and current state.

### AI-Powered Summaries
Each worktree card displays an AI-generated summary of what's happening based on file changes and commit messages. Powered by GPT-5 Nano for fast, context-aware descriptions.

### Mood Indicators
Worktrees are automatically categorized by activity level:
- **ACTIVE** (orange border): Recent changes (< 1 hour ago)
- **STABLE** (blue border): Some changes but not recent
- **STALE** (gray border): No recent activity (> 24 hours)
- **ERROR** (red border): Git status fetch failed

### One-Keystroke Context Extraction
Press `c` on any worktree to copy its changed files to your clipboard via CopyTree integration. Press `p` to open the profile selector and choose from configured CopyTree profiles for different AI context formats.

**CopyTree profiles** let you define preset CLI argument combinations in `.canopy.json`:

```json
{
  "copytreeProfiles": {
    "default": { "args": ["-r"], "description": "Standard recursive scan" },
    "tests": { "args": ["--filter", "tests/**", "-r"], "description": "Tests only" },
    "minimal": { "args": ["--tree-only"], "description": "Structure only" }
  }
}
```

### VS Code Integration
Press `Enter` on any worktree card to open it in VS Code (or your configured editor). The editor opens in the worktree's root directory, preserving your context.

### Fuzzy Search
Press `/` to open fuzzy search and find any file across all worktrees. Search replaces the traditional file browser—use it when you need to dive deep into specific files.

### Live Updates
File watching keeps the dashboard current. As AI agents modify files, you see changes appear in real-time on the relevant worktree card—no manual refresh needed.

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
- `c` - Copy changed files via CopyTree (default profile)
- `p` - Open CopyTree profile selector
- `Enter` - Open worktree in VS Code/editor
- `w` - Cycle to next worktree
- `W` - Open worktree panel (full list)

**Search & Commands:**
- `/` - Fuzzy search across all worktrees
- `Ctrl+F` - Quick filter
- `Esc` - Close modals/search
- `?` - Toggle help

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
  "copytreeProfiles": {
    "default": {
      "args": ["-r"],
      "description": "Standard recursive scan"
    },
    "tests": {
      "args": ["--filter", "tests/**/*.ts", "-r"],
      "description": "Tests only"
    },
    "minimal": {
      "args": ["--tree-only"],
      "description": "Structure only"
    }
  },
  "ui": {
    "compactMode": true,
    "moodGradients": true
  },
  "refreshDebounce": 100
}
```

### Configuration Options

- **`editor`** - Command to open files (default: `code`)
- **`editorArgs`** - Arguments for the editor (default: `["-r"]`)
- **`copytreeProfiles`** - CopyTree profile presets (each profile has `args` array and optional `description`)
- **`showGitStatus`** - Display git status indicators (default: `true`)
- **`refreshDebounce`** - File watcher debounce in ms (default: `100`)
- **`ui.compactMode`** - Compact display mode (default: `true`)
- **`ui.moodGradients`** - Show mood-based header gradients (default: `true`)

See [docs/COPYTREE_INTEGRATION.md](docs/COPYTREE_INTEGRATION.md) for detailed CopyTree profile documentation.

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
- **[docs/COPYTREE_INTEGRATION.md](docs/COPYTREE_INTEGRATION.md)** - CopyTree profiles and context extraction

## License

MIT
