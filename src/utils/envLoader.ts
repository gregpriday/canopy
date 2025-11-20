import fs from 'node:fs';
import path from 'node:path';

/**
 * Manually loads .env file from the current working directory.
 * We do this manually to avoid adding 'dotenv' dependency and to ensure
 * we load from the specific target cwd.
 */
export function loadEnv(cwd: string): void {
  const envPath = path.join(cwd, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        // Match KEY=VALUE, ignoring comments
        const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
        if (match && !line.trim().startsWith('#')) {
          const key = match[1];
          let value = match[2] || '';
          
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'" ) && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          
          // Only set if not already set (system env vars take precedence)
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    } catch (error) {
      // Ignore errors reading .env
    }
  }
}
