import { App } from 'obsidian';
import type { CoordSys, Feature } from '../core/model';
import { isCoordSys } from '../core/model';
import type { DataSource, SourceContext } from '../core/source';
import {
	asString,
	asStringArray,
	featureId,
	isInFolders,
	normalizeTags,
	normalizeTime,
	stableHash,
	toPhotoRefs,
} from './helpers';

type Geometry = {
	type: string;
	coordinates?: unknown;
	geometries?: Geometry[];
};

type GeoJsonFeature = {
	type: 'Feature';
	id?: string | number;
	geometry: Geometry | null;
	properties: Record<string, unknown> | null;
};

function isPoint(value: unknown): value is [number, number] {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		typeof value[0] === 'number' &&
		typeof value[1] === 'number'
	);
}

/** Extract `[lng, lat]` pairs from Point / MultiPoint geometries. */
function pointCoords(geometry: Geometry | null): [number, number][] {
	if (!geometry) return [];
	if (geometry.type === 'Point' && isPoint(geometry.coordinates)) return [geometry.coordinates];
	if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) {
		return (geometry.coordinates as unknown[]).filter(isPoint);
	}
	return [];
}

export class GeoJsonSource implements DataSource {
	id = 'geojson';
	name = 'GeoJSON 文件';
	description = '读取 vault 内所有 .geojson 文件中的点要素';
	kind = 'builtin' as const;

	async load(ctx: SourceContext): Promise<Feature[]> {
		const { app, settings } = ctx;
		const files = app.vault
			.getFiles()
			.filter((file) => file.extension.toLowerCase() === 'geojson')
			.filter((file) => isInFolders(file.path, settings.vault.folders));

		const features: Feature[] = [];
		for (const file of files) {
			let text: string;
			try {
				text = await app.vault.adapter.read(file.path);
			} catch (error) {
				console.warn(`[life-map] failed to read ${file.path}`, error);
				continue;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch (error) {
				console.warn(`[life-map] invalid GeoJSON: ${file.path}`, error);
				continue;
			}
			features.push(...this.extract(parsed, file.path, app, settings.vault.coordSys));
		}
		return features;
	}

	private extract(raw: unknown, path: string, app: App, defaultSys: CoordSys): Feature[] {
		if (!raw || typeof raw !== 'object') return [];
		const collection = raw as { type?: string; features?: unknown; geometry?: unknown; properties?: unknown };

		let items: unknown[];
		if (collection.type === 'FeatureCollection' && Array.isArray(collection.features)) {
			items = collection.features;
		} else if (collection.type === 'Feature') {
			items = [collection];
		} else {
			// Bare geometry object
			items = [{ type: 'Feature', geometry: collection, properties: {} }];
		}

		const features: Feature[] = [];
		for (const item of items) {
			if (!item || typeof item !== 'object') continue;
			const feature = item as GeoJsonFeature;
			const props = (feature.properties ?? {}) as Record<string, unknown>;
			const declared = props['coord_sys'] ?? props['coordSys'];
			const sys: CoordSys = isCoordSys(declared) ? declared : defaultSys;

			for (const [lng, lat] of pointCoords(feature.geometry)) {
				const rawId =
					feature.id !== undefined
						? String(feature.id)
						: asString(props['id']) ?? stableHash(`${path}:${lat}:${lng}:${feature.geometry?.type}`);
				const photos = [
					...toPhotoRefs(app, props['cover']),
					...toPhotoRefs(app, props['photos']),
				];
				features.push({
					id: featureId(this.id, rawId),
					sourceId: this.id,
					name: asString(props['name'] ?? props['title']) ?? undefined,
					lat,
					lng,
					coordSys: sys,
					time: normalizeTime(props['time'] ?? props['date'] ?? props['visited_at']),
					category: asString(props['category'] ?? props['type']),
					tags: normalizeTags(asStringArray(props['tags'])),
					photos,
					link: asString(props['link']) ?? path,
					props: { ...props, file: path },
				});
			}
		}
		return features;
	}
}
