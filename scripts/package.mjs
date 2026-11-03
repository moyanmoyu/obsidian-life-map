/**
 * Build a shareable zip that contains EXACTLY the three files Obsidian loads.
 *
 * Deliberately whitelists files instead of zipping the folder: the plugin
 * folder inside a vault also contains data.json, which holds user settings and
 * API keys (天地图 tk, HTTP tokens). Those must never ship.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';

const REQUIRED = ['manifest.json', 'main.js', 'styles.css'];
const FORBIDDEN = ['data.json', 'workspace.json', '.env'];

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const out = `life-map-${pkg.version}.zip`;

for (const file of REQUIRED) {
	if (!fs.existsSync(file)) {
		console.error(`[package] missing ${file} — run "npm run build" first`);
		process.exit(1);
	}
}
for (const file of FORBIDDEN) {
	if (REQUIRED.includes(file)) {
		console.error(`[package] refusing to ship ${file}`);
		process.exit(1);
	}
}

if (fs.existsSync(out)) fs.unlinkSync(out);
execFileSync('zip', ['-q', '-j', out, ...REQUIRED], { stdio: 'inherit' });

const size = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`[package] ${out} (${size} MB) — contains: ${REQUIRED.join(', ')}`);
console.log('[package] data.json / settings / keys are NOT included.');
