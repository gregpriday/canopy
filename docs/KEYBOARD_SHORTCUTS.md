# Keyboard Shortcuts Reference

Complete keyboard shortcut reference for Canopy's Worktree Dashboard.

## Dashboard Mode (Default)

Canopy launches in Dashboard mode by default, displaying a vertical stack of worktree cards.

### Navigation

| Key | Action |
|-----|--------|
| `↑` | Move focus to previous worktree card |
| `↓` | Move focus to next worktree card |
| `←` | Collapse focused worktree card |
| `→` | Expand focused worktree card |
| `Home` | Jump to first worktree |
| `End` | Jump to last worktree |
| `PageUp` | Scroll up one page |
| `PageDown` | Scroll down one page |
| `Space` | Toggle expansion of focused worktree card (show/hide changed files) |

### Worktree Actions

| Key | Action |
|-----|--------|
| `Enter` | Open focused worktree in VS Code/configured editor |
| `c` | Copy changed files to clipboard via CopyTree |
| `s` | Toggle dev server (start if stopped, stop if running) |
| `w` | Cycle to next worktree (switches active worktree) |
| `W` (Shift+w) | Open worktree panel (shows full list with selection) |

> **Note:** The `s` key only works when `devServer.enabled` is `true` in your config and a dev script is detected for the focused worktree. See [DEV_SERVER.md](./DEV_SERVER.md) for setup.

### Search & Commands

| Key | Action |
|-----|--------|
| `/` | Open command palette (slash commands and fuzzy search) |
| `1-9` | Open quick link by shortcut number |
| `Esc` | Close modals and overlays (see priority below) |

**Esc Key Priority:**
1. Context menu → closes if open
2. Command palette → closes if open
3. Worktree panel → closes if open

### Display & Settings

| Key | Action |
|-----|--------|
| `g` | Toggle git status visibility (show/hide M/A/D markers) |
| `r` | Manual refresh (force reload worktree status and summaries) |

### App Control

| Key | Action |
|-----|--------|
| `q` | Quit Canopy |
| `Ctrl+C` | Force quit (emergency exit) |

## Legacy Tree Mode

Displays traditional hierarchical file tree view.

### Navigation

| Key | Action |
|-----|--------|
| `↑` | Move selection up |
| `↓` | Move selection down |
| `←` | Collapse focused folder (or move to parent) |
| `→` | Expand focused folder (or open file) |
| `Home` | Jump to first item |
| `End` | Jump to last item |
| `PageUp` | Scroll up one page |
| `PageDown` | Scroll down one page |
| `Space` | Toggle folder expansion (without opening) |
| `Enter` | Open file or toggle folder |

### File Actions

| Key | Action |
|-----|--------|
| `c` | Copy file path to clipboard (absolute or relative based on config) |
| `m` | Open context menu for focused file/folder |

### Search & Commands

Same as Dashboard mode.

## Modal-Specific Shortcuts

### Command Palette

| Key | Action |
|-----|--------|
| Type text | Filter commands by name or label (fuzzy search) |
| `↑` / `↓` | Navigate command list |
| `Enter` | Execute selected command |
| `Tab` | Autocomplete to selected command |
| `Esc` | Close command palette |

See [Slash Commands](./SLASH_COMMANDS.md) for configuration and usage.

### Worktree Panel

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate worktree list |
| `Enter` | Switch to selected worktree |
| `Esc` | Close panel without switching |

## Global Keys

These keys work regardless of mode or modal state:

| Key | Action |
|-----|--------|
| `Ctrl+C` | Force quit |

## Tips

### Efficient Workflow

1. **Dashboard Navigation:** Use arrow keys to move between worktrees
2. **Quick Context:** Press `c` to copy changed files for the focused worktree
3. **Dev Server:** Press `s` to toggle the dev server for the focused worktree
4. **Command Palette:** Press `/` to open command palette for quick links and search
5. **Direct Access:** Use `1-9` to instantly open frequently used quick links
6. **Editor Integration:** Press `Enter` to jump into VS Code at the worktree root

### Keyboard-First vs Mouse

All actions are keyboard-accessible, but mouse support is available:
- Click worktree card header to expand/collapse
- Click file names to open in editor
- Right-click for context menus (where supported by terminal)

### Modal Discipline

When multiple modals are open, `Esc` closes them in priority order. Press `Esc` repeatedly to dismiss all overlays and return to the dashboard.

## Customization

Future versions will support custom keybindings via `.canopy.json`. For now, shortcuts are fixed but optimized for common workflows.

See [Configuration](../README.md#configuration) for other customization options.
