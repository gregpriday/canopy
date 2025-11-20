import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Write to debug_canopy directory in project root
const LOG_FILE = path.resolve(__dirname, '../../debug_canopy/runtime_log.txt');

// Clear log file on first import
try {
	fs.writeFileSync(LOG_FILE, `=== Canopy Runtime Trace Log ===\n`);
} catch (err) {
	console.error('Failed to initialize log file:', err);
}

export function trace(component: string, message: string, data: any = {}) {
	const timestamp = new Date().toISOString();
	const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
	const line = `[${timestamp}] [${component}] ${message}\n${dataStr ? '  Data: ' + dataStr + '\n' : ''}`;

	try {
		fs.appendFileSync(LOG_FILE, line);
	} catch (err) {
		console.error('Failed to write log:', err);
	}
}
