/**
 * Copy the built plugin into an Obsidian vault for local testing.
 * Usage:
 *   OBSIDIAN_VAULT=/path/to/vault npm run deploy
 *   npm run deploy -- /path/to/vault
 */
import fs from 'fs';
import path from 'path';
import process from 'process';

const vault =
	process.argv[2] ||
	process.env.OBSIDIAN_VAULT ||
	'/Users/didi/Documents/moyu';

const target = path.join(vault, '.obsidian', 'plugins', 'life-map');
const files = ['manifest.json', 'main.js', 'styles.css'];

if (!fs.existsSync(path.join(vault, '.obsidian'))) {
	console.error(`[deploy] not an Obsidian vault: ${vault}`);
	process.exit(1);
}

fs.mkdirSync(target, { recursive: true });
for (const file of files) {
	if (!fs.existsSync(file)) {
		console.error(`[deploy] missing build artifact: ${file} (run npm run build first)`);
		process.exit(1);
	}
	fs.copyFileSync(file, path.join(target, file));
	console.log(`[deploy] ${file} -> ${path.join(target, file)}`);
}
console.log(`[deploy] done. Open Obsidian -> Settings -> Community plugins -> enable "Life Map".`);
