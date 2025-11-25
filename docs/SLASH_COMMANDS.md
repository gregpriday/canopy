# Slash Commands (Quick Links)

Canopy's slash command system provides quick access to external tools, chat clients, and built-in utilities through a command palette interface.

## Opening the Command Palette

Press `/` (forward slash) to open the command palette. It appears as a full-width overlay directly below the header.

## Built-in Commands

These commands are always available, even without any configuration:

| Command | Description |
|---------|-------------|
| `/config` | Open the Canopy config folder in your file manager. Creates an empty `config.json` if one doesn't exist. |

## User-Configured Commands

Configure custom slash commands in your config file to quickly open external tools and chat clients.

### Configuration

Add quick links to `.canopy.json` (project-level) or `~/.config/canopy/config.json` (global):

```json
{
  "quickLinks": {
    "enabled": true,
    "links": [
      {
        "label": "Claude",
        "url": "https://claude.ai",
        "shortcut": 1,
        "command": "claude"
      },
      {
        "label": "ChatGPT",
        "url": "https://chat.openai.com",
        "shortcut": 2,
        "command": "gpt"
      },
      {
        "label": "Gemini",
        "url": "https://gemini.google.com",
        "command": "gemini"
      }
    ]
  }
}
```

### Quick Link Properties

| Property | Required | Description |
|----------|----------|-------------|
| `label` | Yes | Display name shown in the command palette |
| `url` | Yes | URL to open in your default browser |
| `command` | No | Slash command name (e.g., `claude` for `/claude`) |
| `shortcut` | No | Keyboard shortcut number (1-9) for `Cmd+{num}` access |

### Naming Rules

- **Command names** must be lowercase alphanumeric, starting with a letter
- Valid: `claude`, `gpt4`, `my-tool`
- Invalid: `Claude`, `123`, `-invalid`
- **Shortcuts** must be integers 1-9 (no duplicates)

## Command Palette Usage

### Keyboard Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate through commands |
| `Enter` | Execute selected command |
| `Tab` | Autocomplete to selected command name |
| `Esc` | Close command palette |
| Type text | Filter commands by name or label |

### Fuzzy Search

The command palette supports fuzzy matching on both command names and labels. Type any part of a command name or label to filter results.

Examples:
- Type `cl` to match `/claude` (Claude)
- Type `gem` to match `/gemini` (Gemini)
- Type `config` to match `/config` (Open Config Folder)

## Direct Keyboard Shortcuts

Quick links with `shortcut` numbers (1-9) can be opened directly:

| Shortcut | Action |
|----------|--------|
| `Option+1` | Open quick link with shortcut 1 |
| `Option+2` | Open quick link with shortcut 2 |
| ... | ... |
| `Option+9` | Open quick link with shortcut 9 |

These shortcuts work when no modal is open or when the command palette is open.

## Example Configurations

### AI Chat Clients

```json
{
  "quickLinks": {
    "enabled": true,
    "links": [
      {
        "label": "Claude",
        "url": "https://claude.ai",
        "shortcut": 1,
        "command": "claude"
      },
      {
        "label": "ChatGPT",
        "url": "https://chat.openai.com",
        "shortcut": 2,
        "command": "gpt"
      },
      {
        "label": "Gemini",
        "url": "https://gemini.google.com",
        "shortcut": 3,
        "command": "gemini"
      },
      {
        "label": "Perplexity",
        "url": "https://perplexity.ai",
        "shortcut": 4,
        "command": "perplexity"
      }
    ]
  }
}
```

### Development Tools

```json
{
  "quickLinks": {
    "enabled": true,
    "links": [
      {
        "label": "GitHub",
        "url": "https://github.com",
        "shortcut": 1,
        "command": "gh"
      },
      {
        "label": "npm Registry",
        "url": "https://npmjs.com",
        "command": "npm"
      },
      {
        "label": "MDN Web Docs",
        "url": "https://developer.mozilla.org",
        "command": "mdn"
      },
      {
        "label": "Stack Overflow",
        "url": "https://stackoverflow.com",
        "command": "so"
      }
    ]
  }
}
```

### Project-Specific Links

For project-level `.canopy.json`:

```json
{
  "quickLinks": {
    "enabled": true,
    "links": [
      {
        "label": "Project Docs",
        "url": "https://docs.myproject.com",
        "shortcut": 1,
        "command": "docs"
      },
      {
        "label": "CI/CD Pipeline",
        "url": "https://github.com/myorg/myproject/actions",
        "shortcut": 2,
        "command": "ci"
      },
      {
        "label": "Issue Tracker",
        "url": "https://github.com/myorg/myproject/issues",
        "shortcut": 3,
        "command": "issues"
      }
    ]
  }
}
```

## Disabling Quick Links

Set `enabled: false` to disable user-configured quick links (built-in commands remain available):

```json
{
  "quickLinks": {
    "enabled": false,
    "links": []
  }
}
```

## Tips

1. **Use descriptive labels** - They appear in the command palette and help identify links quickly
2. **Reserve shortcuts for frequently used links** - `Cmd+1` through `Cmd+3` are easy to reach
3. **Use short command names** - Faster to type in the command palette
4. **Global vs project config** - Use global config for personal tools, project config for team-specific links
5. **Quick start** - Press `/config` to open your config folder and start configuring

## Related

- [Keyboard Shortcuts](./KEYBOARD_SHORTCUTS.md) - Complete keyboard reference
- [Configuration](../README.md#configuration) - Full configuration options
