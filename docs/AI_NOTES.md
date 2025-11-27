# AI Note Display

Canopy includes an AI Note feature that allows AI agents to communicate their current workflow status directly to the dashboard. When an agent writes to a well-known file, Canopy displays the message in the worktree card, giving human operators visibility into what the agent is doing.

## Overview

The AI Note feature provides:

- **Agent-to-human communication** - AI agents can broadcast their current status
- **Workflow milestone visibility** - See messages like "Creating PR" or "Running tests"
- **Clickable URLs** - URLs in notes are automatically highlighted and clickable
- **Zero configuration** - Works out of the box with default settings

## How It Works

1. When Canopy detects a worktree, it creates the `canopy/` directory and an empty `note` file in the git directory
2. An AI agent writes a status message to this file at `<git-dir>/canopy/note`
3. Each worktree card displays its own note (polled at the same interval as git status)
4. Only the last line of the file is shown, truncated to 500 characters
5. URLs in the note are highlighted and clickable (opens in default browser)
6. Notes older than 24 hours are deleted on startup for disk hygiene (main worktree notes are always deleted)

## For AI Agents: Writing Notes

### File Location

The note file lives inside the **git directory** (not the worktree directory). Use `git rev-parse --git-dir` to find it:

```bash
# Get the git directory, then append /canopy/note
git rev-parse --git-dir
# Main worktree returns: .git (relative)
# Linked worktree returns: /path/to/repo/.git/worktrees/feature-x (absolute)
```

**Physical locations:**

| Worktree Type | Git Directory | Note File Path |
|---------------|---------------|----------------|
| Main worktree | `<repo>/.git` | `<repo>/.git/canopy/note` |
| Linked worktree | `<repo>/.git/worktrees/<name>` | `<repo>/.git/worktrees/<name>/canopy/note` |

> **Note:** In a linked worktree, the `.git` at the worktree root is a **file** (not a directory) containing a pointer to the actual git directory. Always use `git rev-parse --git-dir` to find the correct location.

### Setting CANOPY_NOTE Environment Variable

For convenience, you can set a `CANOPY_NOTE` environment variable pointing to the note file. This works in both main and linked worktrees:

```bash
export CANOPY_NOTE="$(git rev-parse --absolute-git-dir)/canopy/note"
```

Then writing notes becomes simple:

```bash
echo "Running tests" > "$CANOPY_NOTE"
```

> **Tip:** Add the export to your shell's startup script or set it in your AI agent's environment configuration.

### Writing the Note

**Replace the file content entirely** - Canopy only displays the last line, so there's no benefit to appending. Replacing ensures clean state.

Since Canopy creates the directory and file automatically, you can simply write to it:

```bash
echo "Creating pull request" > "$(git rev-parse --git-dir)/canopy/note"
```

Or in code:

```typescript
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

function writeNote(message: string): void {
  const gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf-8' }).trim();
  const notePath = join(gitDir, 'canopy', 'note');

  // Write the note (replaces content)
  // Canopy creates the directory and file automatically
  writeFileSync(notePath, message + '\n');
}

// Usage
writeNote('Running test suite');
writeNote('Creating initial commit');
writeNote('Opening PR for review');
```

### Display Constraints

- **Only the last line is shown** - If you write multiple lines, only the final line appears
- **Maximum 500 characters** - Longer messages are truncated
- **Plain text preferred** - Avoid emojis; keep messages clean and professional
- **URLs are clickable** - Include URLs (e.g., PR links) and they become clickable

### Best Practices

1. **Use present participle** - "Creating PR", "Running tests", "Waiting for review"
2. **Keep it short** - Aim for 50 characters or less
3. **Update frequently** - Write at each workflow milestone
4. **Include relevant URLs** - PR links, issue links, etc. are automatically clickable
5. **Avoid emojis** - Plain text is cleaner and more professional
6. **Leave final state** - Keep the note showing the final status (e.g., "Created PR ...") so operators can see the outcome

### Example Workflow

```bash
# Starting work
echo "Analyzing issue requirements" > "$(git rev-parse --git-dir)/canopy/note"

# Making changes
echo "Implementing authentication flow" > "$(git rev-parse --git-dir)/canopy/note"

# Testing
echo "Running test suite" > "$(git rev-parse --git-dir)/canopy/note"

# Committing
echo "Creating commit" > "$(git rev-parse --git-dir)/canopy/note"

# PR creation - include the URL so it's clickable
# Leave this as the final state so operators can see the outcome
echo "Created PR https://github.com/user/repo/pull/123" > "$(git rev-parse --git-dir)/canopy/note"
```

## Cleanup

### Startup Cleanup Rules

On startup, Canopy cleans up note files with different rules for main vs linked worktrees:

**Main worktree** (`.git/canopy/note`):
- **Always deleted** on Canopy startup
- The main branch is persistent (not transient like feature worktrees)
- Stale notes from previous sessions should not persist

**Linked worktrees** (`.git/worktrees/*/canopy/note`):
- Deleted only if older than **24 hours**
- Feature worktrees are transient; recent notes may still be relevant

After deleting notes, empty `canopy/` directories are also cleaned up.

### Why Git Directory Storage?

- **Worktree isolation** - Each worktree has its own note, no conflicts
- **Not tracked by git** - Notes don't pollute the repository or show in `git status`
- **Automatic cleanup** - Deleted when worktree is removed via `git worktree remove`

## Configuration

The AI Note feature is enabled by default. To disable or customize:

```json
{
  "note": {
    "enabled": false
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the AI note feature |
| `filename` | string | `canopy/note` | Path relative to git directory for the note file |

## Architecture

### Components

1. **WorktreeMonitor** (`src/services/monitor/WorktreeMonitor.ts`)
   - Reads the note file during each polling cycle (same interval as git status)
   - Extracts only the last line of the file
   - Truncates content to 500 characters
   - Includes note content in worktree state updates

2. **Note Cleanup** (`src/utils/noteCleanup.ts`)
   - Runs once on startup (fire-and-forget)
   - Always deletes main worktree note (main branch is persistent)
   - Deletes linked worktree notes older than 24 hours
   - Cleans up empty `canopy/` directories

3. **NoteDock** (`src/components/NoteDock.tsx`)
   - Displays the note content in a dedicated section
   - Parses URLs and makes them clickable (clicking opens in default browser)

### File Paths

The note is stored within the **git directory** (resolved via `git rev-parse --git-dir`):

| Worktree Type | Note File Path |
|---------------|----------------|
| Main worktree | `<repo>/.git/canopy/note` |
| Linked worktree | `<repo>/.git/worktrees/<name>/canopy/note` |

The `canopy/` subdirectory provides namespacing for future Canopy features that may store additional data in the git directory.

## Troubleshooting

### Note Not Appearing

1. **Check file location** - Use `git rev-parse --git-dir` to find the git directory, then check for `canopy/note` inside it
2. **Verify content** - File must have at least one line of text
3. **Check polling** - Wait up to 2 seconds for the next poll cycle
4. **Check if deleted** - Main worktree notes are always deleted on startup; linked worktree notes are deleted if older than 24 hours

### Wrong Worktree

1. **Use git rev-parse** - Run `git rev-parse --git-dir` from within the worktree to find the correct git directory
2. **Linked worktrees** - The `.git` in a linked worktree is a file, not a directory. The actual git directory is at `<main-repo>/.git/worktrees/<name>/`

## Integration Examples

### Claude Code Hook

Create a hook that writes notes at key workflow points:

```bash
#!/bin/bash
# .claude/hooks/workflow-status.sh

# Canopy creates the directory and file automatically
NOTE_PATH="$(git rev-parse --git-dir)/canopy/note"

case "$1" in
  "start")
    echo "Starting task: $2" > "$NOTE_PATH"
    ;;
  "commit")
    echo "Creating commit" > "$NOTE_PATH"
    ;;
  "pr")
    # Include the PR URL so it's clickable - leave as final state
    echo "Created PR $2" > "$NOTE_PATH"
    ;;
esac
```

### Generic Wrapper

Wrap your AI agent CLI to broadcast status:

```bash
#!/bin/bash
# ai-agent-wrapper.sh

broadcast() {
  # Canopy creates the directory and file automatically
  local note_path="$(git rev-parse --git-dir 2>/dev/null)/canopy/note"
  if [[ -f "$note_path" ]]; then
    echo "$1" > "$note_path"
  fi
}

broadcast "Agent starting"
your-ai-agent "$@"
exit_code=$?

# Leave final state visible for operators
if [ $exit_code -eq 0 ]; then
  broadcast "Completed successfully"
else
  broadcast "Failed with exit code $exit_code"
fi

exit $exit_code
```
