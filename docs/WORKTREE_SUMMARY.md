# Worktree Summary System

## Overview

Canopy's worktree summary system provides real-time visibility into what's happening across multiple git worktrees. The goal is to make changes **visible, clear, and obvious** at a glance, allowing developers (especially those working with AI agents) to quickly understand the state of each worktree without drilling into details.

## Core Objectives

1. **At-a-Glance Understanding**: Users should immediately know what's happening in each worktree
2. **AI-Powered Context**: Meaningful summaries that describe *what* changed and *why*, not just file names
3. **Activity Awareness**: Visual indicators (traffic lights) show recent activity patterns
4. **Zero-Cost for Clean State**: No API calls when worktrees are clean (show last commit instead)
5. **Responsive to Changes**: Quick feedback when files are modified

---

## Summary Display Logic

### Clean Worktrees (No Changes)

**State**: 0 modified files
**Display**: Last commit message prefixed with ✅
**Example**: `✅ feat(auth): add JWT authentication`

**Behavior**:
- Shows the most recent commit message from the current branch
- Updates immediately when worktree transitions from dirty → clean (no debounce)
- No AI API calls required (zero-cost)
- Falls back to generic message if no commits exist

### Dirty Worktrees (Has Changes)

**State**: 1+ modified files
**Display**: AI-generated summary describing the changes
**Example**: `🔧 Refactoring authentication middleware`

**Behavior**:
- Generates AI summary after 10-second debounce (allows user to finish typing)
- Updates when file changes are detected
- Uses `gpt-5-nano` model for fast, cost-effective generation
- Focuses on meaningful changes (ignores lock files, formatting, etc.)

### Special Cases

**Empty/Binary Files**:
- Display: `📝 Modified filename.ext`
- Reason: No text content to analyze, so show file name instead

**Initial Load**:
- Clean worktrees: Show last commit immediately
- Dirty worktrees: Generate AI summary with 10-second debounce
- Prevents API burst on startup while user reviews the UI

### Invalid States

❌ **"Unsaved changes..."** - This should NEVER appear. It was a placeholder introduced during refactoring and indicates a bug where the system failed to generate a proper summary.

❌ **"No active changes"** - Should not appear. Every worktree should show either the last commit (clean) or an AI summary (dirty).

---

## Traffic Light System

The traffic light provides a visual indicator of recent file activity within a worktree. It uses color-coded timing thresholds to show how recently files were modified.

### Color States

#### 🟢 Green - "Active" (0-30 seconds)
**Meaning**: Files were just modified
**Triggers**:
- File modified (content changed)
- File created (new file added)
- File moved/renamed

**Visual**: Green border around worktree card

**Purpose**: Immediately show that Canopy detected your changes

#### 🟡 Yellow - "Recent" (30-90 seconds)
**Meaning**: Files were modified recently but activity has cooled down
**Triggers**:
- Automatic transition after 30 seconds in green state

**Visual**: Yellow border around worktree card

**Purpose**: Show that work happened recently, but isn't actively ongoing

#### ⚪ Gray - "Idle" (>90 seconds)
**Meaning**: No recent file activity
**Triggers**:
- Automatic transition after 90 seconds total (30s green + 60s yellow)
- Default state for worktrees without recent changes

**Visual**: Gray/dim border around worktree card

**Purpose**: Visual "rest state" - nothing happening right now

### State Transitions

```
File Change Event
       ↓
   🟢 GREEN (0-30s)
       ↓ (automatic after 30s)
   🟡 YELLOW (30-90s)
       ↓ (automatic after 60s more)
   ⚪ GRAY (>90s)
       ↓ (stays until next change)
```

**Important**: New file changes immediately reset to green, regardless of current state.

### What Triggers the Traffic Light?

✅ **Triggers Activity**:
- File content modified
- New file created
- File renamed/moved

❌ **Does NOT Trigger**:
- Git operations (commits, branch switches) without file changes
- Reading files
- Polling/refreshing

**Note on Deletions**: File deletions are currently excluded from traffic light triggers as they may not always indicate active work (could be cleanup, reverts, etc.).

---

## Timing & Debouncing

### AI Summary Generation

**Debounce**: 10 seconds
**Reason**: Allows users to finish editing before generating summary. Prevents API spam during active typing.

**Exception - Critical Updates**:
- When worktree transitions from dirty → clean (user reverts/commits changes)
- Summary updates immediately (no 10-second wait)
- Shows last commit message instantly

**Throttle**: Minimum 5 seconds between AI calls
**Reason**: Hard limit to prevent rapid-fire API calls if debouncing fails or multiple changes occur quickly.

### Traffic Light Timings

| State | Duration | Purpose |
|-------|----------|---------|
| Green | 0-30 seconds | Immediate feedback |
| Yellow | 30-90 seconds (60s phase) | Recent activity indicator |
| Gray | >90 seconds | Rest state |

**Decay Behavior**: Once a change occurs, the traffic light will automatically decay through all states unless a new change resets it to green.

---

## Technical Implementation

### Original System (Main Branch)

**Hooks-Based**:
- `useWorktreeSummaries`: Manages AI summary generation with debouncing
- `useActivity`: Tracks file changes and manages traffic light state
- `useMultiWorktreeStatus`: Polls git status for all worktrees

**Event-Driven**:
- File watcher emits `watcher:change` events
- Hooks subscribe to events and update state
- React state triggers re-renders

### New System (Background Workers)

**Class-Based Monitors**:
- `WorktreeMonitor`: Encapsulates all logic for a single worktree
- Runs independently with its own polling timer
- Emits `sys:worktree:update` events
- React components subscribe via `useWorktreeMonitor` hook

**Key Differences**:
- State managed in monitor classes instead of React hooks
- Multiple monitors run concurrently (one per worktree)
- More isolated error handling (one worktree failure doesn't affect others)

---

## User Experience Flow

### Scenario 1: Opening Canopy with Clean Worktrees

1. User runs `canopy`
2. System discovers all worktrees
3. For each clean worktree:
   - Fetch git status (confirms 0 changes)
   - Immediately show last commit message
   - Traffic light: Gray (no recent activity)
4. Total time: <1 second

### Scenario 2: Opening Canopy with Dirty Worktrees

1. User runs `canopy`
2. System discovers all worktrees
3. For each dirty worktree:
   - Fetch git status (shows changed files)
   - Show file count temporarily (e.g., "3 modified files")
   - After 10-second debounce: Generate and display AI summary
   - Traffic light: Gray initially, updates based on actual file mtimes
4. Total time: ~10 seconds for summaries to appear

### Scenario 3: Actively Editing Files

1. User modifies `auth.ts`
2. File watcher detects change
3. Traffic light: Immediately turns green
4. Summary: Shows previous summary (not updated yet)
5. After 10 seconds of no changes:
   - AI generates new summary
   - Summary updates to reflect recent changes
6. After 30 seconds total:
   - Traffic light: Transitions to yellow
7. After 90 seconds total:
   - Traffic light: Transitions to gray
   - Summary: Remains showing the AI-generated description

### Scenario 4: Reverting Changes

1. User has dirty worktree with changes
2. User runs `git restore .` or similar
3. System detects 0 changed files
4. Summary: Immediately updates to last commit message (no 10s wait)
5. Traffic light: Remains in current state (changes to files still occurred)

---

## Design Principles

### 1. Information Density
Each worktree card should convey:
- What branch/worktree this is
- What's happening right now (summary)
- How recently it was worked on (traffic light)
- How many files changed (count badge)

### 2. Actionable Summaries
AI summaries should:
- Start with an emoji for quick visual scanning
- Describe *what* and *why*, not just *which files*
- Use active tense (e.g., "Adding auth" not "Added auth")
- Be concise (≤10 words)
- Focus on the most significant changes

### 3. Visual Hierarchy
- Traffic light: Most prominent (color grabs attention)
- Summary: Secondary (provides context)
- File count: Tertiary (supporting detail)
- Branch name: Always visible (orientation)

### 4. Performance Considerations
- Clean worktrees = 0 API calls
- Dirty worktrees = 1 AI call per change session (debounced)
- Multiple worktrees generate summaries in parallel (with throttling)
- Polling frequency: Active worktree every 1.5s, background every 10s

### 5. Error Resilience
- If AI fails: Show fallback message (e.g., "📝 Modified auth.ts")
- If watcher fails: Fall back to polling
- If one worktree errors: Others continue working
- Network issues: Graceful degradation with retry logic

---

## Common Issues & Solutions

### Issue: Traffic light stays gray even when files change
**Cause**: File watcher not running or polling-only mode
**Solution**: Ensure file watching is enabled and working. Check `--no-watch` flag.

### Issue: Summary shows "Unsaved changes..."
**Cause**: Bug in state transitions or AI generation failure
**Solution**: This is invalid - investigate state machine and error handling

### Issue: Summary not updating after file changes
**Cause**: Debounce still active or equality check blocking updates
**Solution**: Wait 10 seconds or check if file change was actually detected

### Issue: AI summaries not appearing on startup
**Cause**: Initial AI generation not triggered
**Solution**: Verify `start()` method calls `updateAISummary()` after first git fetch

### Issue: Too many API calls
**Cause**: Throttling/debouncing not working correctly
**Solution**: Check `AI_SUMMARY_MIN_INTERVAL_MS` and debounce logic

---

## Configuration

### Environment Variables

- `OPENAI_API_KEY`: Required for AI summaries (falls back to file names without it)
- `CANOPY_DEBUG_SUMMARIES=1`: Enable debug logging for summary generation

### Timing Constants

Located in `src/services/monitor/WorktreeMonitor.ts`:

```typescript
const GIT_STATUS_DEBOUNCE_MS = 1000;           // Git status polling delay
const AI_SUMMARY_DEBOUNCE_MS = 10000;          // AI generation delay
const AI_SUMMARY_MIN_INTERVAL_MS = 5000;       // Minimum time between AI calls
const TRAFFIC_LIGHT_GREEN_DURATION = 30000;    // Green state duration
const TRAFFIC_LIGHT_YELLOW_DURATION = 60000;   // Yellow state duration (additional)
// Total idle threshold = 90000ms (30s + 60s)
```

**Note**: Current implementation uses 2s/10s for traffic lights. This should be updated to 30s/90s per user requirements.

---

## Future Enhancements

1. **Configurable Timings**: Allow users to adjust traffic light durations
2. **Activity Patterns**: Learn which files/patterns indicate meaningful work
3. **Smart Coalescing**: Group rapid consecutive changes before calling AI
4. **Offline Mode**: Better handling when API is unavailable
5. **Custom Emojis**: Let users define emoji mappings for different change types
6. **Summary History**: Keep recent summaries for rollback/comparison
