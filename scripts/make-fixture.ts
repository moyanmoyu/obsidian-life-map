/**
 * Generate a synthetic GeoJSON fixture so the map can be stress-tested inside
 * Obsidian. Usage:
 *   npm run fixture -- 20000 /path/to/vault/00-Inbox/life-map-bench.geojson
 * Delete the file when you are done; it is not part of the plugin.
 */
import fs from 'node:fs';

const size = Number(process.argv[2] ?? 5000);
const out = process.argv[3] ?? '/Users/didi/Documents/moyu/00-Inbox/life-map-bench.geojson';

const features = Array.from({ length: size }, (_, index) => {
	const lng = 73.5 + Math.random() * 61;
	const lat = 18 + Math.random() * 35;
	const date = new Date(Date.UTC(2020 + (index % 6), index % 12, (index % 28) + 1));
	return {
		type: 'Feature',
		properties: {
			name: `压测点 ${index}`,
			category: ['food', 'sight', 'cafe'][index % 3],
			time: date.toISOString().slice(0, 10),
			tags: [`bench${index % 20}`],
		},
		geometry: { type: 'Point', coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))] },
	};
});

const collection = { type: 'FeatureCollection', features };
fs.writeFileSync(out, JSON.stringify(collection, null, 2));
const bytes = fs.statSync(out).size;
console.log(`wrote ${size} points (${(bytes / 1024).toFixed(0)} KB) -> ${out}`);
