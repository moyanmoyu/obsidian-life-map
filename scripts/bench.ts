/**
 * Synthetic performance benchmark for the data pipeline.
 *
 * It measures the JS work we control (coordinate normalisation, GeoJSON
 * building, filtering, serialisation). It deliberately does NOT measure
 * MapLibre's WebGL rendering or clustering — those depend on the GPU and can
 * only be judged inside Obsidian.
 *
 * Usage: npm run bench
 */
import { toWGS84 } from '../src/core/coords';
import type { Feature } from '../src/core/model';

const SIZES = [1000, 5000, 20000, 50000];

function now(): number {
	return Number(process.hrtime.bigint() / 1000n) / 1000;
}

function makeFeature(index: number): Feature {
	// Roughly inside mainland China
	const lng = 73.5 + Math.random() * 61;
	const lat = 18 + Math.random() * 35;
	return {
		id: `bench:${index}`,
		sourceId: 'bench',
		name: `地点 ${index}`,
		lat,
		lng,
		coordSys: 'GCJ02',
		time: new Date(Date.UTC(2020, index % 12, (index % 28) + 1)).toISOString(),
		category: ['food', 'sight', 'cafe'][index % 3],
		tags: [`tag${index % 20}`],
		photos: index % 5 === 0 ? [{ url: `https://example.com/${index}.jpg` }] : [],
		link: `places/${index}.md`,
		props: { index, note: `some payload ${index}` },
	};
}

function benchSize(size: number): void {
	const features = Array.from({ length: size }, (_, index) => makeFeature(index));

	// 1. coordinate normalisation (what FeatureService does on every load)
	const t0 = now();
	const normalised = features.map((feature) => {
		const [lat, lng] = toWGS84(feature.lat, feature.lng, feature.coordSys);
		return { ...feature, lat, lng, coordSys: 'WGS84' as const };
	});
	const tCoord = now() - t0;

	// 2. GeoJSON building (what MapView.repaint does on every filter change)
	const t1 = now();
	const geojson = {
		type: 'FeatureCollection' as const,
		features: normalised.map((feature, index) => ({
			type: 'Feature' as const,
			geometry: { type: 'Point' as const, coordinates: [feature.lng, feature.lat] },
			properties: {
				index,
				color: '#0091ff',
				hasPhotos: feature.photos.length > 0,
			},
		})),
	};
	const tGeojson = now() - t1;

	// 3. serialise (the payload handed to MapLibre's worker)
	const t2 = now();
	const serialised = JSON.stringify(geojson);
	const tSerialize = now() - t2;

	// 4. text filter pass (sidebar + map filtering share this predicate)
	const t3 = now();
	const needle = '地点 1';
	const matched = normalised.filter((feature) => (feature.name ?? '').toLowerCase().includes(needle));
	const tFilter = now() - t3;

	// 5. sort for the sidebar (naive: Date.parse inside the comparator)
	const t4 = now();
	[...normalised].sort((a, b) => Date.parse(b.time ?? '') - Date.parse(a.time ?? ''));
	const tSortNaive = now() - t4;

	// 6. sort with precomputed timestamps (what Sidebar does now)
	const t5 = now();
	const decorated = normalised.map((feature) => ({
		feature,
		time: feature.time ? Date.parse(feature.time) : NaN,
	}));
	decorated.sort((a, b) => b.time - a.time);
	const tSort = now() - t5;

	const kb = (serialised.length / 1024).toFixed(0);
	console.log(
		[
			`${String(size).padStart(6)} 点`,
			`坐标 ${tCoord.toFixed(1)}ms`,
			`GeoJSON ${tGeojson.toFixed(1)}ms`,
			`序列化 ${tSerialize.toFixed(1)}ms`,
			`过滤 ${tFilter.toFixed(1)}ms (${matched.length})`,
			`排序 ${tSort.toFixed(1)}ms`,
			`排序(旧) ${tSortNaive.toFixed(1)}ms`,
			`体积 ${kb}KB`,
		].join('  |  ')
	);
}

console.log('Life Map 数据管线基准（仅 JS，不含 WebGL 渲染）\n');
for (const size of SIZES) benchSize(size);
console.log('\n参考：坐标跨度取中国范围，过滤关键词固定为 "地点 1"。');
