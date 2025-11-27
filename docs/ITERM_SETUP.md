# iTerm2 Setup Guide

A guide for configuring iTerm2 for a multi-pane workflow with Claude Code and Canopy.

## Goals

- Seamless mouse interaction across split panes (no extra click to focus)
- Clean visual appearance without distracting highlights or dimming
- New split panes inherit the working directory
- Option-Backspace deletes whole words
- Shift-Enter creates a newline (useful in Claude Code)

---

## Settings

Open iTerm2 Settings with `⌘,`

### 1. Focus Follows Mouse

When running multiple split panes (e.g., Canopy on the left, Claude Code instances on the right), you normally need to click a pane to focus it before you can interact with buttons or text. This setting eliminates that extra click.

1. Open **iTerm2 → Settings** (or press `⌘,`)
2. Go to the **Pointer** tab
3. Check **Focus follows mouse**

Now simply hovering over a pane will focus it, so your first click can immediately interact with buttons.

> **Tip:** If you find this too aggressive, go to **Settings → Advanced** and search for "focus" to find options for adding a hover delay.

---

### 2. Remove the Title Bar

The bar at the top of each window showing what's running can be removed for a cleaner look.

1. Open **iTerm2 → Settings** (`⌘,`)
2. Go to the **Appearance** tab
3. Click the **General** subtab
4. Under **Theme**, find the **Style** dropdown
5. Set it to **No Title Bar** (or **Compact** if you still want a slim draggable area)

> **Note:** With "No Title Bar," you'll need keyboard shortcuts or the tab bar to move windows. "Compact" gives you a very slim bar that's still draggable.

---

### 3. Disable Pane Dimming

By default, inactive panes are dimmed. This can be distracting when monitoring multiple panes.

1. Open **iTerm2 → Settings** (`⌘,`)
2. Go to the **Appearance** tab
3. Look for the **Dimming** section on the right side
4. Uncheck **Dim inactive split panes**
5. Set **Dimming amount** to **2** (all the way low)

This keeps all panes at the same brightness regardless of focus.

---

### 4. Disable Command Selection Highlighting

When you click on a pane, iTerm2 has a feature that "selects" the current command and dims everything else. This is the "Command Selection" feature.

1. Open **iTerm2 → Settings** (`⌘,`)
2. Go to the **General** tab
3. Click the **Selection** subtab
4. Uncheck **Clicking on a command selects it to restrict Find and Filter**

This prevents the dimming/selection effect when clicking on a pane.

---

### 5. Reuse Working Directory for New Splits

When you create a new split pane, you probably want it to open in the same directory as the current pane.

1. Open **iTerm2 → Settings** (`⌘,`)
2. Go to the **Profiles** tab
3. Select your profile on the left (usually "Default")
4. Click the **General** subtab
5. Find the **Working Directory** section
6. Set it to **Advanced Configuration**
7. Click **Edit...**
8. For **Working Directory for New Split Panes**, select **Reuse previous session's directory**

Now when you split a pane (`⌘D` or `⌘⇧D`), the new pane starts in the same directory.

---

### 6. Option Key for Word Navigation

Make Option-Backspace delete whole words, and Option-Left/Right jump between words.

1. Open **iTerm2 → Settings** (`⌘,`)
2. Go to the **Profiles** tab
3. Select your profile on the left
4. Click the **Keys** subtab
5. Click the **General** subtab within Keys
6. Find **Left Option Key**
7. Set it to **Esc+**

Now you get:
- `Option-Backspace` — Delete previous word
- `Option-Left` — Jump to previous word
- `Option-Right` — Jump to next word

---

### 7. Shift-Enter for Newline

In Claude Code, pressing Enter submits your input. To insert a newline instead (for multi-line prompts), configure Shift-Enter.

1. Open **iTerm2 → Settings** (`⌘,`)
2. Go to the **Profiles** tab
3. Select your profile on the left
4. Click the **Keys** subtab
5. Click the **Key Mappings** subtab
6. Click the **+** button to add a new mapping
7. For **Keyboard Shortcut**, press `Shift-Enter`
8. For **Action**, select **Send Text**
9. In the text field, type `\n`
10. Click **OK**

Now Shift-Enter inserts a newline in Claude Code instead of submitting.

---

## Summary

| Step | Location | Setting | Value |
|------|----------|---------|-------|
| 1 | Pointer | Focus follows mouse | On |
| 2 | Appearance → General | Style | No Title Bar |
| 3 | Appearance → Dimming | Dim inactive split panes | Off |
| 3 | Appearance → Dimming | Dimming amount | 2 |
| 4 | General → Selection | Clicking on a command selects it... | Off |
| 5 | Profiles → General | Working Directory | Advanced → Reuse previous session's directory |
| 6 | Profiles → Keys → General | Left Option Key | Esc+ |
| 7 | Profiles → Keys → Key Mappings | Shift-Enter | Send Text: `\n` |

---

## Recommended Layout

For Canopy with Claude Code:

1. Launch iTerm2
2. Split vertically with `⌘D`
3. In the left pane, run `canopy`
4. Resize the left pane to ~60-80 columns wide
5. Use the right pane(s) for Claude Code sessions

With the settings above, you can hover over any pane and immediately interact with it, see all panes at equal brightness, and use familiar word-navigation shortcuts.
