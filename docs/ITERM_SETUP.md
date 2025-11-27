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

### Pointer

- [x] **Focus follows mouse**

This lets you interact with a pane immediately on hover, without clicking first to focus it.

### Appearance

#### General

- **Style**: Set to **No Title Bar** (or **Compact** if you still want a slim draggable area)

#### Dimming

- [ ] **Dim inactive split panes** (uncheck)
- **Dimming amount**: Set to **2** (all the way low)

### General → Selection

- [ ] **Clicking on a command selects it to restrict Find and Filter** (uncheck)

This prevents the "command selection" feature from dimming everything else when you click on a pane.

### Profiles → General

#### Working Directory

1. Set to **Advanced Configuration**
2. Click **Edit...**
3. For **Working Directory for New Split Panes**, select **Reuse previous session's directory**

### Profiles → Keys

#### General

- **Left Option Key**: Set to **Esc+**

This enables Option-Backspace to delete whole words, and Option-Left/Right to jump between words.

#### Key Mappings

Click the **+** button to add a new key mapping:

| Keyboard Shortcut | Action | Value |
|-------------------|--------|-------|
| Shift-Enter | Send Text | `\n` |

This lets Shift-Enter insert a newline instead of submitting (useful in Claude Code).

---

## Summary

| Setting Location | Setting | Value |
|------------------|---------|-------|
| Pointer | Focus follows mouse | On |
| Appearance → General | Style | No Title Bar |
| Appearance → Dimming | Dim inactive split panes | Off |
| Appearance → Dimming | Dimming amount | 2 |
| General → Selection | Clicking on a command selects it... | Off |
| Profiles → General | Working Directory | Advanced → Reuse previous session's directory |
| Profiles → Keys → General | Left Option Key | Esc+ |
| Profiles → Keys → Key Mappings | Shift-Enter | Send Text: `\n` |
