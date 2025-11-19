# Canopy

> Rise above the forest floor. Watch your AI agents work from the canopy.

A terminal-based file browser built with Ink (React for CLIs) that transforms your terminal into a lightweight IDE. The canopy is where you get perspective—the highest vantage point in the forest, where you can see everything below.

## The Philosophy

### The Problem: Lost Visual Context

When working with CLI-based AI coding agents (Claude Code, Gemini CLI, Codex, etc.), you lose the visual context that traditional IDEs provide. You can't easily see:
- What files the AI just created
- Which files are being modified in real-time
- What's been deleted or moved
- The overall structure of your project as it evolves

Running `ls -R` or `git status` constantly breaks your flow and pulls focus from the agent's work.

### The Solution: The Ghostty Stack

**Canopy sits in a narrow, balanced split in your terminal multiplexer** (Ghostty, tmux, or any terminal with split support). Think of it as the missing file tree sidebar for your terminal-based workflow:

```
┌─────────────────┐  ┌──────────────────────────────────────┐
│ Canopy          │  │ AI Agent (Claude Code)               │
│ (passive view)  │  │ (active work)                        │
├─────────────────┤  ├──────────────────────────────────────┤
│                 │  │                                      │
│ src/            │  │ > Implementing authentication...     │
│   App.ts        │  │                                      │
│ M auth.ts       │  │ Progress: [===========   ] 60%       │
│ A login.ts      │  │                                      │
│ tests/          │  │ $ npm test                           │
│ M auth.test.ts  │  │ ✓ All tests passing                  │
│                 │  │                                      │
└─────────────────┘  └──────────────────────────────────────┘
  60-70 cols           Remaining terminal width
```

**Left pane:** Canopy provides passive observability—a real-time view of your file system
**Right pane(s):** Your AI agent does the active work

You simply **glance left** to see what's happening. No commands needed.

### Why This Matters

- **Instant Awareness:** See modifications (`M`), additions (`A`), deletions (`D`) as they happen
- **Context Preservation:** Keep your mental model of the project structure intact
- **Workflow Integration:** Works seamlessly with git worktrees for multi-task AI workflows
- **Zero Friction:** No switching between windows, tabs, or running status commands

## Features

### Real-time Agent Monitoring
Git status markers show exactly what your AI agent is touching. Modified files appear with `M`, new files with `A`, deleted with `D`. No manual `git status` needed—just look left.

### Instant Updates
Live file watching means the tree updates immediately as the AI writes to disk. See new test files appear, watch refactors move code, observe deletions—all in real-time without manual refresh.

### Split-Pane Optimized UI
Designed specifically for narrow widths (60-70 columns). Compact mode hides unnecessary metadata, maximizing screen real estate for your code panes while still providing complete context.

### Intelligent Context Switching
Full git worktree support detects and switches between branches instantly. Jump between different agent tasks or experiments without losing your place. Each worktree remembers its own expanded folders and selected files.

### Mouse & Keyboard Navigation
Click to select files and expand folders, or use keyboard shortcuts. Built for efficiency whether you're mouse-first or keyboard-driven.

### Smart Filtering
Quickly filter the tree by name or git status (`/filter modified` shows only changed files). Perfect for focusing on what the AI just touched.

### Hierarchical Tree View
Collapsible folders with infinite depth. Respects `.gitignore` by default, with options to show hidden files or apply custom ignore patterns.

## CopyTree Integration

Canopy isn't just for observing—it's for **giving context** to your AI.

Press `c` on any file to copy its path to your clipboard. Use it to:
- Quickly reference files in your next prompt to the AI
- Share context between different AI sessions
- Build up file lists for batch operations

Integration with [CopyTree](https://github.com/gregpriday/copytree) allows one-keystroke context extraction directly into your LLM prompts.

## Installation

```bash
npm install -g @gpriday/canopy
```

### Recommended Setup

**Ghostty Users:** Create a split layout with Canopy in the left pane:
1. Launch Ghostty
2. Split vertically (Cmd+D or Ctrl+Shift+\)
3. In the left pane: `canopy`
4. Resize to ~60-70 columns wide
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

# Start with a filter applied
canopy --filter "*.ts"

# Disable file watching (for very large projects)
canopy --no-watch

# Show hidden files
canopy --hidden
```

### Keyboard Shortcuts

**Navigation:**
- `↑/↓` - Navigate tree
- `←/→` - Collapse folder / expand folder or open file
- `PageUp/PageDown` - Page navigation
- `Space` - Toggle folder expansion
- `Enter` - Open file or toggle folder

**File Actions:**
- `c` - Copy file path to clipboard
- `m` - Open context menu

**Commands & UI:**
- `/` - Open command bar
- `Ctrl+F` - Quick filter
- `Esc` - Close modals/filter
- `?` - Toggle help

**Git & Worktrees:**
- `g` - Toggle git status visibility
- `w` - Cycle to next worktree
- `W` - Open worktree panel

**Other:**
- `r` - Manual refresh
- `q` - Quit

## Configuration

Create a `.canopy.json` file in your project root or `~/.config/canopy/config.json` for global settings.

```json
{
  "editor": "code",
  "editorArgs": ["-r"],
  "showGitStatus": true,
  "showHidden": false,
  "respectGitignore": true,
  "ui": {
    "compactMode": true,
    "leftClickAction": "select"
  },
  "sortBy": "name",
  "sortDirection": "asc",
  "refreshDebounce": 100
}
```

### Configuration Options

- **`editor`** - Command to open files (default: `code`)
- **`editorArgs`** - Arguments for the editor (default: `["-r"]`)
- **`openers`** - Custom openers by file extension/glob pattern
- **`showGitStatus`** - Display git status indicators (default: `true`)
- **`showHidden`** - Show hidden files (default: `false`)
- **`respectGitignore`** - Respect .gitignore patterns (default: `true`)
- **`customIgnores`** - Additional glob patterns to ignore
- **`sortBy`** - Sort files by: `name`, `size`, `modified`, `type` (default: `name`)
- **`sortDirection`** - Sort direction: `asc` or `desc` (default: `asc`)
- **`maxDepth`** - Maximum tree depth (default: unlimited)
- **`refreshDebounce`** - File watcher debounce in ms (default: `100`)
- **`ui.compactMode`** - Compact display mode (default: `true`)
- **`ui.leftClickAction`** - Mouse left click behavior: `open` or `select` (default: `select`)

## The Future: Autonomous Observer

Canopy is evolving from a passive viewer to an active participant in AI-driven development:

### Planned Features

- **AI-Driven Insights:** "What happened while I was gone?" summaries powered by worktree analysis
- **Intelligent Change Detection:** Automatic categorization of changes (refactoring, new features, bug fixes)
- **Multi-Agent Coordination:** Visual indicators for which agent touched which files in collaborative sessions
- **Context Recommendations:** Smart suggestions for what files to include in your next AI prompt
- **Session Replay:** Visual timeline of how your project evolved during an AI session

The goal: Transform Canopy from an observation tool into an intelligent partner that helps you understand and guide your AI agents.

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

## License

MIT
