# WorktreeCard Display Specification

## Overview

The **WorktreeCard** is the primary information component in Canopy's dashboard view. Each card represents a single git worktree and displays real-time information about its state, activity, and changes. The card is designed to provide **at-a-glance understanding** of what's happening in each worktree without requiring user interaction.

**Design Goal**: Make changes **visible, clear, and obvious** so developers can quickly assess worktree state and activity patterns.

---

## Card Layout Structure

The WorktreeCard is organized into 4 distinct rows plus an action bar:

```
┌─────────────────────────────────────────────────┐
│ Row 1: Branch Name                    Path      │  ← Identity
│ Row 2: ● File Count • +Insertions • -Deletions │  ← Statistics + Traffic Light
│ Row 3: AI Summary or Last Commit               │  ← Context
│ [Row 4: File List (when expanded)]             │  ← Details
│                                                 │
│ [Collapse/Expand]    [CopyTree] [VS Code]      │  ← Actions
└─────────────────────────────────────────────────┘
```

### Border

The card border provides two pieces of information:

1. **Border Style**: `double` if focused (keyboard selection), `round` if not focused
2. **Border Color**: Reflects the traffic light state (see Traffic Light section below)

---

## Row 1: Identity (Branch & Path)

**Purpose**: Identify which worktree this card represents

### Left Side: Branch Name
- **Display**: Branch name in bold
- **Color**:
  - Gold/yellow if worktree has active changes (`mood === 'active'`)
  - Default text color if stable
- **Special Indicators**:
  - `● ` prefix (with accent color) if this is the current/active worktree
  - `(detached)` warning suffix if HEAD is detached

**Examples**:
- `● feat/background-workers` ← Current worktree, active
- `main` ← Different worktree, clean
- `abc123 (detached)` ← Detached HEAD

### Right Side: Path
- **Display**: Relative path from active root
- **Color**: Tertiary text (dim/gray)
- **Logic**:
  - For main/master branches: Show full absolute path
  - For feature branches: Show relative path from parent directory
  - Truncate middle if path exceeds 50 characters

**Examples**:
- `/Users/user/project` ← Main branch
- `../canopy-main` ← Other worktree
- `.` ← Current directory

---

## Row 2: Statistics Bar with Traffic Light

**Purpose**: Quick numerical overview of changes with activity indicator

### Format
```
● 3 files • +45 • -12
```

### Components

#### Traffic Light (● Symbol)
- **Position**: Far left of statistics bar
- **Color**: Green, Yellow, or Gray (see Traffic Light System section)
- **Purpose**: Show how recently files were modified (0-30s, 30-90s, >90s)

#### File Count
- **Format**: `{count} file` or `{count} files` (plural)
- **Color**: Secondary text
- **Source**: Total number of changed files (modified, added, deleted, renamed, untracked)

#### Insertions
- **Format**: `+{count}`
- **Color**: Green (added lines color from theme)
- **Source**: Total lines added across all changed files

#### Deletions
- **Format**: `-{count}`
- **Color**: Red (deleted lines color from theme)
- **Source**: Total lines deleted across all changed files

#### Separators
- **Character**: `•` (bullet)
- **Color**: Dim
- **Purpose**: Visual separation between metrics

---

## Row 3: AI Summary / Last Commit

**Purpose**: Provide meaningful context about what's happening in this worktree

This row displays different content depending on worktree state:

### State A: Clean Worktree (0 changed files)

**Display**: Last commit message with ✅ prefix

**Format**: `Last commit: ✅ {first line of commit message}`

**Color**: Tertiary text (dim/gray)

**Examples**:
- `Last commit: ✅ feat(auth): add JWT authentication`
- `Last commit: ✅ fix: resolve memory leak in watcher`

**Behavior**:
- Always shown when worktree is clean (even if it was dirty before)
- Updates immediately when worktree becomes clean (no debounce)
- Falls back to `"Clean: {branch}"` if no commits exist

---

### State B: Dirty Worktree (1+ changed files)

**Display**: AI-generated summary of changes

**Color**: Secondary text (brighter than tertiary)

**Examples**:
- `🔧 Refactoring authentication middleware`
- `✨ Adding dark mode support to dashboard`
- `🐛 Fixing memory leak in file watcher`

**Behavior**:
- Generated after 10-second debounce (waits for user to finish editing)
- Updates when new file changes are detected
- Uses `gpt-5-nano` model for fast, cost-effective generation
- Focuses on meaningful changes (analyzes diffs, not just file names)

**AI Summary Guidelines**:
- Start with emoji for quick visual scanning
- Describe **what** and **why**, not just **which files**
- Use active tense (e.g., "Adding auth" not "Added auth")
- Keep concise (≤10 words)
- Focus on most significant changes

---

### State C: Loading (Summary Generation in Progress)

**Display**: `Generating summary...`

**Color**: Tertiary text (dim/gray)

**When**:
- During initial AI summary generation
- Between detecting changes and completing AI call (if debounce hasn't elapsed)

---

### Invalid States (Should Never Appear)

❌ **"Unsaved changes..."** - This was a placeholder from refactoring and indicates a bug

❌ **"No active changes"** - Every worktree should show either last commit (clean) or AI summary (dirty)

If these appear, it indicates a state machine bug in `WorktreeMonitor`.

---

## Row 4: File List (Expandable)

**Display**: Only shown when card is expanded (user presses Space or Enter)

**Purpose**: Show individual file changes with statistics

### Container
- **Border**: Single border with separator color
- **Margin**: 1 row above list

### File Change Row Format
```
M src/services/monitor.ts              +42  -15
```

#### Left Side: Status + Path
- **Status Glyph**: Single letter indicating change type
  - `M` = Modified (yellow/modified color)
  - `A` = Added (green color)
  - `D` = Deleted (red color)
  - `R` = Renamed (yellow/modified color)
  - `?` = Untracked (dim/tertiary color)
  - `·` = Ignored (dim/tertiary color)

- **Path**: Relative path from worktree root
  - Truncated to 46 characters (middle truncation with `...`)
  - Default text color

#### Right Side: Change Statistics
- **Format**: `+{insertions}  -{deletions}`
- **Colors**: Green for insertions, red for deletions
- **Special**: `---` if statistics unavailable (binary files, etc.)

### Sorting Priority
Files are sorted by:
1. **Status Priority**: Modified → Added → Deleted → Renamed → Untracked → Ignored
2. **Churn** (within same status): Higher total changes (insertions + deletions) first
3. **Alphabetical** (if churn is equal): Path comparison

### Limits
- **Maximum Visible**: 10 files
- **Overflow**: `...and {count} more` shown at bottom if >10 files

---

## Traffic Light System

The traffic light is a visual indicator of **recent file activity** within the worktree. It answers the question: "How recently were files modified?"

### Visual Representation

The traffic light appears in two places:
1. **Statistics Bar** (Row 2): As the colored `●` symbol
2. **Card Border**: Border color matches traffic light state

### Color States

#### 🟢 Green - "Active Development" (0-30 seconds)

**Meaning**: Files were just modified (within the last 30 seconds)

**Visual**:
- Traffic light: Bright green `●`
- Border: Green (`palette.git.added`)

**Triggers**:
- File content modified
- New file created
- File renamed/moved

**Duration**: 30 seconds, then automatically transitions to yellow

**Purpose**: Immediately confirm that Canopy detected your changes

---

#### 🟡 Yellow - "Recent Activity" (30-90 seconds)

**Meaning**: Files were modified recently but activity has cooled down

**Visual**:
- Traffic light: Gold/yellow `●`
- Border: Yellow (`palette.git.modified`)

**Triggers**:
- Automatic transition after 30 seconds in green state

**Duration**: 60 additional seconds (90 seconds total from initial change), then transitions to gray

**Purpose**: Show that work happened recently but isn't actively ongoing

---

#### ⚪ Gray - "Idle" (>90 seconds or no recent activity)

**Meaning**: No recent file activity

**Visual**:
- Traffic light: Dim gray `●`
- Border: Gray (`palette.chrome.border`)

**Triggers**:
- Automatic transition after 90 seconds total (30s green + 60s yellow)
- Default state when Canopy starts (no recent changes detected)

**Duration**: Indefinite until next file change

**Purpose**: Visual "rest state" - nothing happening right now

---

### State Transition Flow

```
File Change Event
       ↓
   🟢 GREEN (0-30s)
       ↓ (automatic after 30s)
   🟡 YELLOW (30-90s)
       ↓ (automatic after 60s more)
   ⚪ GRAY (>90s)
       ↓ (stays here until next change)
```

**Important**: Any new file change immediately resets to green, regardless of current state.

### What Triggers Activity?

✅ **Triggers Green State**:
- File content modified (text, binary, any file)
- New file created
- File renamed or moved

❌ **Does NOT Trigger**:
- Git operations (commits, branch switches) without file changes
- Reading files (opening in editor)
- Git status polling/refreshing

**Note on Deletions**: File deletions currently do NOT trigger traffic light changes, as they may indicate cleanup/reverts rather than active development.

---

## Action Buttons

**Position**: Bottom row of card

**Layout**: Expand/Collapse on left, CopyTree and VS Code on right

### Button Format
- **Style**: `[Label]` in square brackets
- **Color**: Secondary text (default), inverts to black-on-white when pressed
- **Interactive**: Click or keyboard activation (when card is focused)

### Buttons

1. **Expand / Collapse**
   - **Label**: "Expand" when collapsed, "Collapse" when expanded
   - **Action**: Toggle file list visibility (Row 4)
   - **Shortcut**: Space key

2. **CopyTree**
   - **Label**: "CopyTree"
   - **Action**: Execute default CopyTree profile with changed files
   - **Shortcut**: `c` key

3. **VS Code**
   - **Label**: "VS Code"
   - **Action**: Open worktree in configured editor
   - **Shortcut**: Enter key

---

## Information Hierarchy & Visual Design

### Primary (Most Prominent)
- **Traffic Light Color**: Most eye-catching element (green/yellow/gray border + dot)
- **Branch Name**: Bold, larger text, sometimes colored (active state)

### Secondary
- **AI Summary**: Main content row, meaningful context
- **Statistics**: File count, insertions, deletions

### Tertiary (Supporting Details)
- **Path**: Location information
- **Last Commit**: When worktree is clean
- **Action Buttons**: Available but not primary focus

### Hierarchy Rationale
1. **Traffic light first**: Answers "Is anyone working here right now?"
2. **Branch + Summary**: Answers "What is this and what's happening?"
3. **Statistics**: Answers "How big are the changes?"
4. **Actions**: "What can I do with this?"

---

## Display States & Timing

### Startup Behavior

**Clean Worktrees**:
1. Fetch git status (confirms 0 changes)
2. Immediately show last commit message
3. Traffic light: Gray (no recent activity detected)
4. Total time: <1 second

**Dirty Worktrees**:
1. Fetch git status (shows changed files)
2. Show statistics immediately (file count, +/-)
3. Show "Generating summary..." in Row 3
4. After 10-second debounce: Generate and display AI summary
5. Traffic light: Gray initially (will turn green if files are modified during debounce)
6. Total time: ~10 seconds for summary to appear

### Active Editing

1. User modifies a file (e.g., saves in editor)
2. **Traffic light**: Immediately turns green (border changes)
3. **Summary**: Shows previous summary (not updated yet)
4. **Statistics**: Update within 1 second (git status debounce)
5. After 10 seconds of no changes:
   - AI generates new summary
   - Summary row updates
6. After 30 seconds total:
   - Traffic light transitions to yellow
7. After 90 seconds total:
   - Traffic light transitions to gray
   - Summary remains (showing last generated description)

### Reverting Changes (Dirty → Clean)

1. User has dirty worktree with AI summary displayed
2. User runs `git restore .` or similar (reverts all changes)
3. System detects 0 changed files
4. **Summary**: Immediately updates to last commit message (no 10-second wait)
5. **Statistics**: Update to `0 files • +0 • -0`
6. **Traffic light**: Remains in current state (file changes still occurred, decay continues)

**Key Point**: Dirty→Clean transitions bypass the 10-second debounce for instant feedback.

---

## Special Cases & Edge Cases

### Empty Repository (No Commits)
- **Row 1**: Branch name or "(no branch)"
- **Row 3**: `"Clean: {branch}"` or `"No changes"`
- **Statistics**: `0 files • +0 • -0`

### Detached HEAD
- **Row 1**: Commit hash + `(detached)` warning
- **Color**: Warning color for "(detached)" label

### Binary Files Only
- **AI Summary**: May fall back to `📝 Modified {filename}` if no text diffs available
- **Statistics**: Insertions/deletions shown as `---` if unavailable

### Single File Changes
- **Behavior**: Generate AI summary even for single files
- **Reason**: Users want meaningful context, not just "Modified 1 file"
- **Exception**: Empty files or files with no actual diff → `📝 Modified {filename}`

### Very Large Changes (>10 files)
- **File List**: Show first 10 files (sorted by priority)
- **Overflow**: `...and {count} more` at bottom
- **AI Summary**: Focuses on most significant changes (uses file modification time and churn)

---

## Configuration & Constants

### Timing Values

**AI Summary Debounce**: 10 seconds
- Why: Allows users to finish editing before generating summary
- Exception: Dirty→Clean transitions update immediately

**AI Throttle**: Minimum 5 seconds between calls
- Why: Hard limit to prevent API spam

**Traffic Light Timings**:
- Green Duration: 30 seconds
- Yellow Duration: 60 additional seconds (90 seconds total)
- Gray: Indefinite

### Display Limits

**Path Truncation**:
- Row 1 path: 50 characters
- File paths: 46 characters
- Method: Middle truncation with `...`

**File List**:
- Maximum visible: 10 files
- Sorting: Status priority → Churn → Alphabetical

---

## Visual Theme Integration

The WorktreeCard uses theme colors from `palette`:

### Text Colors
- **Primary**: Branch name (default state)
- **Secondary**: AI summary (dirty state), statistics, action buttons
- **Tertiary**: Path, last commit message, "Generating..." message

### Git Status Colors
- **Added/Green**: `palette.git.added` - Insertions, green traffic light, added files
- **Modified/Yellow**: `palette.git.modified` - Modified files, yellow traffic light
- **Deleted/Red**: `palette.git.deleted` - Deletions, deleted files

### Border Colors
- **Green**: Active development (0-30s) → `palette.git.added`
- **Yellow**: Recent activity (30-90s) → `palette.git.modified`
- **Gray**: Idle (>90s) → `palette.chrome.border`

### Accent Colors
- **Active Worktree Indicator**: `palette.accent.primary` - `●` prefix on current worktree
- **Active Mood**: `palette.git.modified` - Branch name when worktree has changes

---

## Error States & Fallbacks

### AI Generation Failure
- **Display**: Fallback to mechanical summary (e.g., `📝 Modified {filename}`)
- **User Impact**: Minimal - still shows file statistics and list
- **Recovery**: Will retry on next change detection

### Git Operations Failure
- **Display**: Error mood (red border)
- **Summary**: Error message or last known good state
- **User Impact**: Card shows but may have stale data

### File Watcher Failure
- **Display**: Normal (no visual indication)
- **Behavior**: Falls back to polling-only mode
- **Traffic Light**: Still updates based on modification times detected during polling

---

## Design Principles

### 1. Information Density
Each card conveys exactly these pieces of information:
- **Identity**: What branch/worktree is this?
- **Activity**: How recently was this worked on?
- **Context**: What's happening right now?
- **Magnitude**: How big are the changes?
- **Details**: Which files changed? (when expanded)

### 2. Visual Scanning
- **Color-coded**: Traffic light uses border color for instant recognition
- **Emoji-prefixed**: AI summaries start with emoji for quick visual parsing
- **Hierarchical**: Most important information (traffic light, branch) is largest/boldest

### 3. Progressive Disclosure
- **Collapsed by default**: Shows summary, hides file list
- **Expand on demand**: Press Space to see detailed file listing
- **Maximum 10 files**: Prevents information overload

### 4. Responsiveness
- **Immediate visual feedback**: Traffic light turns green instantly on file change
- **Smart debouncing**: Waits 10 seconds before calling AI (saves cost, prevents spam)
- **Critical updates bypass debounce**: Clean state shows immediately

### 5. Zero-Cost Philosophy
- **Clean worktrees**: Use `git log` (free, instant) instead of AI
- **Dirty worktrees**: One AI call per editing session (debounced)
- **Result**: Minimal API costs even with many worktrees

---

## Common Display Issues

### Traffic Light Stuck on Gray
**Symptom**: Files are being modified but traffic light doesn't turn green

**Causes**:
- File watcher not running (`--no-watch` flag)
- File changes not triggering watcher events (network drives, permissions)

**Check**: Ensure file watching is enabled and working properly

---

### Summary Shows "Generating..." Indefinitely
**Symptom**: Summary never updates from loading state

**Causes**:
- AI API call failed (no `OPENAI_API_KEY` or network issue)
- State machine stuck (bug in `WorktreeMonitor`)

**Check**:
- Verify `OPENAI_API_KEY` is set
- Check debug logs for API errors

---

### Summary Shows "No active changes" on Dirty Worktree
**Symptom**: Worktree has changes but shows clean state message

**Causes**:
- Initial AI generation not triggered on startup
- Git status not refreshing properly

**Fix**: This is a bug - AI summary generation should trigger for all dirty worktrees

---

### Summary Not Updating After File Changes
**Symptom**: File changes detected (traffic light turns green) but summary stays old

**Causes**:
- Still within 10-second debounce window (wait longer)
- Equality check blocking update (bug if file changes are real)

**Check**: Wait at least 10 seconds after last file change

---

### Border Color Doesn't Match Traffic Light
**Symptom**: Traffic light dot is green but border is gray/different color

**Causes**:
- Bug in border color logic (should use `trafficLight` state, not `mood`)
- Theme palette misconfiguration

**Fix**: Ensure `WorktreeCard` uses `trafficLight` for border color calculation

---

## Future Enhancements

### Display Improvements
1. **Stale Indicator**: Visual warning when worktree hasn't been touched in >7 days
2. **Conflict Marker**: Highlight worktrees with merge conflicts
3. **Ahead/Behind**: Show commit count relative to upstream branch
4. **Summary History**: Toggle to see previous AI summaries

### Customization
1. **Configurable Emoji**: Let users define emoji mappings for change types
2. **Custom Traffic Light Timings**: Allow per-user/per-project timing adjustments
3. **Expanded by Default**: Option to always show file lists

### Information Additions
1. **Test Status**: Show if tests are passing/failing
2. **CI Status**: Show GitHub Actions or other CI status
3. **Pull Request Link**: If worktree has associated PR

---

## Implementation Reference

### Component
`src/components/WorktreeCard.tsx`

### Props
```typescript
interface WorktreeCardProps {
  worktree: Worktree;              // Branch, path, current status
  changes: WorktreeChanges;        // File changes with stats
  mood: WorktreeMood;              // active | stable | stale | error
  trafficLight: 'green' | 'yellow' | 'gray';
  isFocused: boolean;              // Keyboard selection
  isExpanded: boolean;             // File list visible
  activeRootPath: string;          // For relative path calculation
  onToggleExpand: () => void;
  onCopyTree?: () => void;
  onOpenEditor?: () => void;
  registerClickRegion?: (...) => void;  // Mouse interaction
}
```

### Key Methods
- `formatRelativePath()`: Convert absolute paths to readable relative paths
- `truncateMiddle()`: Truncate long paths with `...` in middle
- `FileChangeRow`: Render individual file change with stats

### State Source
- **Traffic Light**: Managed by `WorktreeMonitor`, emitted via `sys:worktree:update` events
- **Summary**: Generated by `WorktreeMonitor` using AI or git log
- **Changes**: Fetched by `WorktreeMonitor` via git status polling

---

## Testing Checklist

When testing WorktreeCard display, verify:

- [ ] Clean worktree shows last commit message with ✅ prefix
- [ ] Dirty worktree shows AI summary after 10-second debounce
- [ ] Traffic light turns green immediately on file change
- [ ] Traffic light transitions to yellow after 30 seconds
- [ ] Traffic light transitions to gray after 90 seconds
- [ ] Border color matches traffic light state
- [ ] Statistics update within 1 second of file change
- [ ] File list shows top 10 files sorted by priority
- [ ] File list shows "...and X more" when >10 files
- [ ] Expand/Collapse toggles file list visibility
- [ ] Action buttons respond to clicks and keyboard
- [ ] Current worktree shows `●` prefix
- [ ] Detached HEAD shows warning
- [ ] Reverting changes (dirty→clean) updates summary immediately
- [ ] Single-file changes generate AI summary (not just "Modified 1 file")
- [ ] Empty files show `📝 Modified {filename}` fallback
- [ ] No "Unsaved changes..." or "No active changes" invalid states appear
