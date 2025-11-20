/**
 * File icon utilities using Nerd Font icons
 * Provides extension-based icon mapping for visual file type identification
 */

/**
 * Map file extension or name to Nerd Font icon
 */
export function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const name = fileName.toLowerCase();

  // Specific filenames (highest priority)
  const nameMap: Record<string, string> = {
    // Config files
    'package.json': '',
    'tsconfig.json': '',
    'webpack.config.js': '󰜫',
    'vite.config.js': '󰡄',
    'vite.config.ts': '󰡄',
    'rollup.config.js': '',
    'jest.config.js': '',
    'vitest.config.ts': '',
    '.gitignore': '',
    '.gitattributes': '',
    '.dockerignore': '',
    'docker-compose.yml': '',
    'docker-compose.yaml': '',
    'dockerfile': '',
    '.env': '',
    '.env.local': '',
    '.env.development': '',
    '.env.production': '',
    '.prettierrc': '',
    '.eslintrc': '',
    '.eslintrc.js': '',
    '.eslintrc.json': '',
    'readme.md': '',
    'changelog.md': '',
    'license': '',
    'makefile': '',
    '.editorconfig': '',
    'yarn.lock': '',
    'package-lock.json': '',
    'pnpm-lock.yaml': '',
    '.npmrc': '',
    '.nvmrc': '',
    '.node-version': '',
  };

  if (nameMap[name]) {
    return nameMap[name];
  }

  // Extension-based mapping
  const extMap: Record<string, string> = {
    // Programming languages
    js: '',
    jsx: '',
    ts: '',
    tsx: '',
    py: '',
    rb: '',
    go: '',
    rs: '',
    java: '',
    c: '',
    cpp: '',
    cs: '󰌛',
    php: '',
    swift: '',
    kt: '󱈙',
    scala: '',
    r: '󰟔',
    lua: '',
    vim: '',
    sh: '',
    bash: '',
    zsh: '',
    fish: '',

    // Web
    html: '',
    css: '',
    scss: '',
    sass: '',
    less: '',
    vue: '',
    svelte: '',
    astro: '',

    // Data & Config
    json: '',
    yaml: '',
    yml: '',
    toml: '',
    xml: '',
    csv: '',
    sql: '',

    // Documentation
    md: '',
    mdx: '',
    txt: '',
    pdf: '',
    doc: '',
    docx: '',

    // Media
    png: '',
    jpg: '',
    jpeg: '',
    gif: '',
    svg: '󰜡',
    ico: '',
    webp: '',
    mp4: '',
    mov: '',
    avi: '',
    mp3: '',
    wav: '',
    flac: '',

    // Archives
    zip: '',
    tar: '',
    gz: '',
    rar: '',
    '7z': '',

    // Other
    lock: '',
    log: '',
    gitignore: '',
    env: '',
  };

  if (extMap[ext]) {
    return extMap[ext];
  }

  // Default file icon
  return '-';
}

/**
 * Get folder icon based on name and expansion state
 */
export function getFolderIcon(folderName: string, expanded: boolean): string {
  const name = folderName.toLowerCase();

  // Special folder icons
  const specialFolders: Record<string, string> = {
    'node_modules': '',
    '.git': '',
    '.github': '',
    src: '',
    lib: '',
    dist: '',
    build: '',
    public: '',
    assets: '',
    images: '',
    img: '',
    styles: '',
    css: '',
    components: '',
    utils: '',
    helpers: '',
    services: '',
    api: '',
    config: '',
    test: '',
    tests: '',
    __tests__: '',
    docs: '',
    examples: '',
    scripts: '',
    bin: '',
    vendor: '',
  };

  if (specialFolders[name]) {
    return specialFolders[name];
  }

  // Default folder icons based on expansion state
  return expanded ? '▼' : '▶';
}
