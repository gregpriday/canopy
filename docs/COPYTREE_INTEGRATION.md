# CopyTree Integration

Complete guide to using CopyTree profiles with Canopy for one-keystroke AI context extraction.

## Overview

Canopy integrates deeply with [CopyTree](https://github.com/gregpriday/copytree) to provide instant context packet generation for AI prompts. Instead of manually running `copytree` commands, you can:

1. **Press `c`** on any worktree card → copies changed files with default profile
2. **Press `p`** → selects a profile → **then press `c`** → copies with selected profile
3. **Paste into your AI prompt** → LLM receives perfectly formatted context

## Quick Start

### Default Behavior

Without any configuration, pressing `c` on a worktree card copies the changed files to your clipboard using CopyTree's default settings (`-r` flag for recursive).

### Example Output

```xml
<file_tree>
  <file path="src/App.tsx" />
  <file path="src/components/WorktreeCard.tsx" />
  <file path="src/hooks/useDashboardNav.ts" />
</file_tree>
```

You can paste this directly into your AI conversation—the AI reads the referenced files automatically.

## Configuring Profiles

Create custom profiles in `.canopy.json` (project-level) or `~/.config/canopy/config.json` (global):

```json
{
  "copytreeProfiles": {
    "default": {
      "args": ["-r"],
      "description": "Standard recursive scan (uses .copytree.yml if present)"
    },
    "minimal": {
      "args": ["--tree-only"],
      "description": "Structure only, no file contents"
    },
    "tests": {
      "args": ["--filter", "tests/**/*.ts", "-r"],
      "description": "Tests only"
    },
    "debug": {
      "args": ["-r", "--verbose"],
      "description": "Recursive with debug output"
    }
  }
}
```

### Profile Structure

Each profile is an object with:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `args` | `string[]` | Yes | Array of CLI arguments to pass to `copytree` command |
| `description` | `string` | No | Human-readable description shown in profile selector |

**Example:**
```json
{
  "args": ["--filter", "src/**/*.ts", "-r"],
  "description": "Source TypeScript files only"
}
```

## How Profiles Work

### The Two-Step Process

1. **Select profile** (optional): Press `p` → choose a profile → modal closes
2. **Execute CopyTree**: Press `c` → runs CopyTree with the selected profile (or default if none selected)

**Important:** The profile selector (`p` key) only **sets** the active profile—it doesn't execute CopyTree. You must press `c` after selecting a profile to actually copy files.

### What Happens When You Press `c`

When you press `c` on a worktree card, Canopy:

1. Gets the changed files for the focused worktree (via git status)
2. Resolves the profile arguments from config (using the last selected profile, or "default")
3. Builds a CopyTree command: `copytree <args> <changed-file-paths>`
4. Executes it and copies the output to your clipboard
5. Shows a success notification: `✓ CopyTree completed`

## Profile Examples

### 1. Default (Standard Recursive)

**Use case:** Quick context sharing with AI—uses CopyTree's default behavior.

```json
{
  "default": {
    "args": ["-r"],
    "description": "Standard recursive scan"
  }
}
```

**Command executed:**
```bash
copytree -r src/App.tsx src/hooks/useDashboardNav.ts
```

### 2. Tree Only (No Contents)

**Use case:** Share file structure without file contents.

```json
{
  "minimal": {
    "args": ["--tree-only"],
    "description": "Structure only"
  }
}
```

**Command executed:**
```bash
copytree --tree-only src/App.tsx src/hooks/useDashboardNav.ts
```

### 3. Filtered (Tests Only)

**Use case:** Share only test files with AI for debugging.

```json
{
  "tests": {
    "args": ["--filter", "tests/**/*.ts", "-r"],
    "description": "Tests only"
  }
}
```

**Note:** The `--filter` flag is applied by CopyTree itself, and it further filters the already-filtered list of changed files from git status.

### 4. Verbose/Debug

**Use case:** Troubleshooting CopyTree execution.

```json
{
  "debug": {
    "args": ["-r", "--verbose"],
    "description": "Recursive with debug output"
  }
}
```

## Using Profiles

### Workflow

1. **Focus a worktree card** with keyboard navigation (`↑`/`↓`)
2. **(Optional) Select a profile:** Press `p` → choose from list → press `Enter`
3. **Copy files:** Press `c`
4. **Paste into AI prompt**

### Profile Selector Modal

When you press `p`:

```
┌────────────────────────────────────┐
│ CopyTree Profile Selector          │
├────────────────────────────────────┤
│ > default (Standard recursive)     │
│   minimal (Structure only)         │
│   tests (Tests only)               │
│   debug (Recursive with debug)     │
└────────────────────────────────────┘
```

Use `↑`/`↓` to select, `Enter` to confirm, `Esc` to cancel.

**After selecting:** The modal closes. The selected profile is now "active" for the next `c` press.

### Success Notification

After pressing `c`:

```
✓ CopyTree completed
```

The changed files are now on your clipboard, formatted according to the profile's arguments.

## Advanced Usage

### Custom CopyTree Arguments

The `args` array accepts any valid CopyTree CLI arguments. Refer to `copytree --help` for the full list.

**Common flags:**
- `-r` - Recursive (include file contents)
- `--tree-only` - Structure only (no contents)
- `--filter <pattern>` - Filter files by glob pattern
- `--format <format>` - Output format (xml, markdown, json)
- `--verbose` - Show debug output

### Example: Markdown with Filter

```json
{
  "docs": {
    "args": ["--format", "markdown", "--filter", "**/*.md", "-r"],
    "description": "Documentation files in markdown format"
  }
}
```

### Example: JSON Output

```json
{
  "json": {
    "args": ["--format", "json", "-r"],
    "description": "JSON format for programmatic use"
  }
}
```

## Implementation Details

### Event System

Internally, Canopy uses an event bus for CopyTree actions:

```typescript
import { events } from './services/events';

// Event payload
interface CopyTreePayload {
  rootPath: string;
  profile: string;
  extraArgs: string[];
  files: string[];  // Changed files from git status
}

// Emit event
events.emit('file:copy-tree', {
  rootPath: '/Users/name/canopy-issue-156',
  profile: 'tests',
  extraArgs: [],
  files: ['src/App.tsx', 'tests/App.test.tsx']
});
```

**Note:** The event uses `rootPath` (not `worktreeId`). Canopy converts the worktree ID to a root path before emitting.

### Profile Resolution

When you press `c`, Canopy:

1. Looks up the profile name (from last `p` selection, or "default")
2. Finds `config.copytreeProfiles[profileName]`
3. Extracts `profile.args` array
4. Executes: `copytree <args> <changed-files>`

If the profile doesn't exist:
- Falls back to `config.copytreeProfiles.default`
- If default doesn't exist, uses built-in fallback: `["-r"]`
- Logs a warning (not shown to user)

### Fallback Behavior

**Profile not found:**
```typescript
// Code logs warning, uses default profile
// User sees: "✓ CopyTree completed" (no error shown)
```

**No changed files:**
```typescript
// CopyTree still executes but with empty file list
// User sees: "✓ CopyTree completed"
```

**CopyTree command fails:**
```typescript
// Error is logged to console
// User sees: "✗ CopyTree failed: <error message>"
```

## Best Practices

### 1. Keep Profiles Simple

CopyTree profiles are just CLI argument lists. Don't overcomplicate them:

```json
{
  "good": {
    "args": ["-r"],
    "description": "Simple and clear"
  },
  "too-complex": {
    "args": ["--filter", "**/*.{ts,tsx,js,jsx}", "--exclude", "node_modules", "--format", "markdown", "--tree-depth", "3", "-r"],
    "description": "Hard to understand and maintain"
  }
}
```

### 2. Name Profiles Descriptively

Use clear names that indicate purpose:
- ✅ `tests`, `docs`, `source`, `minimal`
- ❌ `p1`, `custom`, `thing`

### 3. Use Descriptions

The `description` field appears in the profile selector—make it helpful:

```json
{
  "tests": {
    "args": ["--filter", "tests/**", "-r"],
    "description": "Tests only"  // Shows in selector
  }
}
```

### 4. Test Your Profiles

After creating a profile, test it:
1. Focus a worktree with changes
2. Press `p`, select your profile, press `Enter`
3. Press `c` to execute
4. Paste the clipboard contents to verify output

### 5. Check CopyTree Documentation

Profile arguments are passed directly to CopyTree CLI. Consult `copytree --help` or [CopyTree docs](https://github.com/gregpriday/copytree) for available flags.

## Troubleshooting

### "CopyTree command not found"

**Problem:** CopyTree CLI is not installed or not in PATH.

**Solution:**
```bash
npm install -g copytree
# or
brew install copytree
```

### Profile Not Appearing in Selector

**Problem:** Profile defined in config but not showing.

**Solution:**
- Verify JSON syntax in `.canopy.json`
- Restart Canopy to reload config
- Check config location: project `.canopy.json` or global `~/.config/canopy/config.json`

### "Invalid profile args" Error on Startup

**Problem:** Profile `args` field is not an array.

**Solution:**
```json
{
  "bad": {
    "args": "-r"  // ❌ String, not array
  },
  "good": {
    "args": ["-r"]  // ✅ Array of strings
  }
}
```

### Nothing Happens When Pressing `c`

**Problem:** CopyTree executes but clipboard is empty.

**Solution:**
- Check if worktree has changed files (git status)
- Verify CopyTree is installed: `which copytree`
- Check terminal output for error messages
- Try the `debug` profile with `--verbose` to see CopyTree output

### Wrong Files Copied

**Problem:** CopyTree copies unexpected files.

**Solution:**
- Remember: Canopy only passes **changed files** to CopyTree (from git status)
- If you want all files, use the `/copytree` command directly (not implemented yet)
- Check your `--filter` pattern if using one

## Integration with AI Workflows

### Claude Code Example

```bash
# In your Claude Code conversation:
> I need help with the authentication worktree

[Navigate to auth worktree in Canopy, press `c`]
[Paste clipboard]

> These are the changed files. Can you review for security issues?
```

### Profile for Different AI Tasks

```json
{
  "copytreeProfiles": {
    "review": {
      "args": ["-r"],
      "description": "Full context for code review"
    },
    "debug": {
      "args": ["-r", "--verbose"],
      "description": "Debug output included"
    },
    "minimal": {
      "args": ["--tree-only"],
      "description": "Structure only for architecture discussion"
    }
  }
}
```

## See Also

- [CopyTree Documentation](https://github.com/gregpriday/copytree)
- [Keyboard Shortcuts](KEYBOARD_SHORTCUTS.md)
- [Configuration Guide](../README.md#configuration)
