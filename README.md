# Canopy

> The tall tree from which you oversee your AI agents at work.

A terminal-based file browser built with ink (React for CLIs) designed for developers working with AI agents. Named after South Africa's tallest indigenous tree, the Outeniqua Canopy, symbolizing oversight and observation from a commanding vantage point.

## Features

- **Hierarchical file tree view** with collapsible folders
- **Mouse support** for clicking files and folders
- **Live file watching** with real-time updates
- **Git status integration** showing modified, added, deleted files
- **CopyTree integration** for easy AI context sharing
- **Keyboard navigation** with intuitive shortcuts
- **Search/filter** capabilities
- **Preview pane** (optional)

## Installation

```bash
npm install -g canopy
```

## Usage

```bash
# Run in current directory
canopy

# Run in specific directory
canopy /path/to/project
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Watch mode
npm run dev

# Run locally
npm start
```

## Configuration

Create a `.canopy.json` file in your project root or `~/.config/canopy/config.json` for global settings.

```json
{
  "editor": "code",
  "showGitStatus": true,
  "showHidden": false,
  "respectGitignore": true
}
```

## License

MIT
