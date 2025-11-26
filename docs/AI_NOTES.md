# AI Note Display

Canopy includes an AI Note feature that allows AI agents to communicate their current workflow status directly to the dashboard. When an agent writes to a well-known file, Canopy displays the message in the worktree card, giving human operators visibility into what the agent is doing.

## Overview

The AI Note feature provides:

- **Agent-to-human communication** - AI agents can broadcast their current status
- **Workflow milestone visibility** - See messages like "Creating PR" or "Running tests"
- **Clickable URLs** - URLs in notes are automatically highlighted and clickable
- **Zero configuration** - Works out of the box with default settings

## How It Works

1. An AI agent writes a status message to `.git/canopy/note`
2. Canopy detects the file and displays the last line in the worktree card
3. URLs in the note are highlighted and clickable (opens in default browser)
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

### Garbage Collection (24 hours)

On startup, Canopy deletes note files older than 24 hours:

- Scans `.git/canopy/note` (main worktree)
- Scans `.git/worktrees/*/canopy/note` (linked worktrees)
- Deletes any notes with mtime > 24 hours ago
- Removes empty `canopy/` directories

This is a disk hygiene measure - notes should not accumulate indefinitely.

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

## Architecture

### Components

1. **WorktreeMonitor** (`src/services/monitor/WorktreeMonitor.ts`)
   - Reads the note file during each polling cycle
   - Includes note content in worktree state updates

2. **Note Cleanup** (`src/utils/noteCleanup.ts`)
   - Runs once on startup (fire-and-forget)
   - Scans all worktree git directories
   - Deletes notes older than 24 hours
   - Cleans up empty `canopy/` directories

3. **NoteDock** (`src/components/NoteDock.tsx`)
   - Displays the note content in a dedicated section
   - Parses URLs and makes them clickable
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
2. **Verify content** - File must have at least one line of text
3. **Check polling** - Wait up to 2 seconds for the next poll cycle
4. **Check if deleted** - Startup cleanup removes notes older than 24 hours

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
  local note_path="$(git rev-parse --git-dir 2>/dev/null)/canopy/note"
  if [[ -n "$note_path" ]]; then
    mkdir -p "$(dirname "$note_path")"
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
