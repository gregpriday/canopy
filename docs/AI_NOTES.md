# AI Note Display

Canopy includes an AI Note feature that allows AI agents to communicate their current workflow status directly to the dashboard. When an agent writes to a well-known file, Canopy displays the message in the worktree card, giving human operators visibility into what the agent is doing.

## Overview

The AI Note feature provides:

- **Agent-to-human communication** - AI agents can broadcast their current status
- **Workflow milestone visibility** - See messages like "Creating PR" or "Running tests"
- **Automatic staleness handling** - Notes disappear after 5 minutes of inactivity
- **Zero configuration** - Works out of the box with default settings

## How It Works

1. An AI agent writes a status message to `.git/canopy/note`
2. Canopy detects the file and displays the last line in the worktree card
3. If the note hasn't been updated in 5 minutes, it's hidden (agent likely finished or crashed)
4. Notes older than 24 hours are deleted on startup for disk hygiene

## For AI Agents: Writing Notes

### File Location

Write your status to the note file inside the git directory:

```
<worktree>/.git/canopy/note
```

For linked worktrees, the path is:

```
<main-repo>/.git/worktrees/<worktree-name>/canopy/note
```

To find the correct path programmatically:

```bash
# Get the git directory for the current worktree
git rev-parse --git-dir
# Returns: /path/to/repo/.git (main worktree)
# Returns: /path/to/repo/.git/worktrees/feature-x (linked worktree)

# Then append /canopy/note
```

### Writing the Note

**Replace the file content entirely** - Canopy only displays the last line, so there's no benefit to appending. Replacing ensures clean state.

```bash
# Create the directory if needed
mkdir -p "$(git rev-parse --git-dir)/canopy"

# Write the status (replaces file content)
echo "Creating pull request" > "$(git rev-parse --git-dir)/canopy/note"
```

Or in code:

```typescript
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

function writeNote(message: string): void {
  const gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf-8' }).trim();
  const notePath = join(gitDir, 'canopy', 'note');

  // Ensure directory exists
  mkdirSync(dirname(notePath), { recursive: true });

  // Write the note (replaces content)
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
- **Plain text only** - No formatting or special characters needed

### Best Practices

1. **Use present participle** - "Creating PR", "Running tests", "Waiting for review"
2. **Keep it short** - Aim for 50 characters or less
3. **Update frequently** - Write at each workflow milestone
4. **Clear when done** - Delete the file or let it expire naturally

### Example Workflow

```bash
# Starting work
echo "Analyzing issue requirements" > "$(git rev-parse --git-dir)/canopy/note"

# Making changes
echo "Implementing authentication flow" > "$(git rev-parse --git-dir)/canopy/note"

# Testing
echo "Running test suite" > "$(git rev-parse --git-dir)/canopy/note"

# Committing
echo "Creating initial commit" > "$(git rev-parse --git-dir)/canopy/note"

# PR creation
echo "Opening pull request" > "$(git rev-parse --git-dir)/canopy/note"

# Done - optionally clear
rm "$(git rev-parse --git-dir)/canopy/note"
```

## Staleness and Cleanup

### Display TTL (5 minutes)

Notes that haven't been modified in 5 minutes are hidden from the display. This handles the case where an agent crashes, disconnects, or finishes without cleaning up its note.

- The file remains on disk
- Canopy simply doesn't display it
- If the agent writes again, the note reappears immediately

### Garbage Collection (24 hours)

On startup, Canopy deletes note files older than 24 hours:

- Scans `.git/canopy/note` (main worktree)
- Scans `.git/worktrees/*/canopy/note` (linked worktrees)
- Deletes any notes with mtime > 24 hours ago
- Removes empty `canopy/` directories

This is a disk hygiene measure - notes should not accumulate indefinitely.

### Why This Design?

**Separate TTLs for display vs deletion:**

- **5-minute display TTL** - Fast enough to hide stale notes from crashed agents, but long enough to survive brief network hiccups or agent restarts
- **24-hour deletion TTL** - Aggressive display hiding, conservative deletion. The file might be useful for debugging or the agent might resume

**Git directory storage:**

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

## Architecture

### Components

1. **WorktreeMonitor** (`src/services/monitor/WorktreeMonitor.ts`)
   - Reads the note file during each polling cycle
   - Applies 5-minute TTL filtering based on file mtime
   - Includes note content in worktree state updates

2. **Note Cleanup** (`src/utils/noteCleanup.ts`)
   - Runs once on startup (fire-and-forget)
   - Scans all worktree git directories
   - Deletes notes older than 24 hours
   - Cleans up empty `canopy/` directories

3. **WorktreeCard** (`src/components/WorktreeCard.tsx`)
   - Displays the `aiNote` field if present
   - Truncates to 500 characters

### File Paths

The note is stored within the git directory structure:

```
# Main worktree
/path/to/repo/.git/canopy/note

# Linked worktree
/path/to/repo/.git/worktrees/feature-branch/canopy/note
```

The `canopy/` subdirectory provides namespacing for future Canopy features that may store additional data in the git directory.

## Troubleshooting

### Note Not Appearing

1. **Check file location** - Must be in `.git/canopy/note`, not the worktree root
2. **Check file age** - Notes older than 5 minutes are hidden
3. **Verify content** - File must have at least one line of text
4. **Check polling** - Wait up to 2 seconds for the next poll cycle

### Note Disappeared

1. **Check file mtime** - The note may have aged past the 5-minute TTL
2. **Write again** - Simply update the file to make it visible again
3. **Check if deleted** - Startup cleanup may have removed a 24+ hour old note

### Wrong Worktree

1. **Check git directory** - Use `git rev-parse --git-dir` to find the correct path
2. **Linked worktrees** - Notes go in `.git/worktrees/<name>/canopy/note`, not the main `.git/`

## Integration Examples

### Claude Code Hook

Create a hook that writes notes at key workflow points:

```bash
#!/bin/bash
# .claude/hooks/workflow-status.sh

NOTE_PATH="$(git rev-parse --git-dir)/canopy/note"
mkdir -p "$(dirname "$NOTE_PATH")"

case "$1" in
  "start")
    echo "Starting task: $2" > "$NOTE_PATH"
    ;;
  "commit")
    echo "Creating commit" > "$NOTE_PATH"
    ;;
  "pr")
    echo "Opening pull request" > "$NOTE_PATH"
    ;;
  "done")
    rm -f "$NOTE_PATH"
    ;;
esac
```

### Generic Wrapper

Wrap your AI agent CLI to broadcast status:

```bash
#!/bin/bash
# ai-agent-wrapper.sh

broadcast() {
  local note_path="$(git rev-parse --git-dir 2>/dev/null)/canopy/note"
  if [[ -n "$note_path" ]]; then
    mkdir -p "$(dirname "$note_path")"
    echo "$1" > "$note_path"
  fi
}

broadcast "Agent starting"
your-ai-agent "$@"
exit_code=$?
broadcast "Agent finished (exit: $exit_code)"
sleep 2  # Give Canopy time to display before it expires
exit $exit_code
```
