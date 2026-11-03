import { requestUrl } from 'obsidian';
import type { CoordSys, Feature, PhotoRef } from '../core/model';
import { isCoordSys } from '../core/model';
import {
	getList,
	getNumber,
	getString,
	getStringList,
} from '../core/jsonpath';
import type { DataSource, SourceContext } from '../core/source';
import type { HttpSourceConfig } from '../settings';
import { featureId, normalizeTime, stableHash } from './helpers';

function toPhotoRefs(raw: unknown[]): PhotoRef[] {
	const photos: PhotoRef[] = [];
	for (const item of raw) {
		if (typeof item === 'string' && item.trim()) {
			photos.push({ url: item.trim() });
			continue;
		}
		if (item && typeof item === 'object') {
			const record = item as Record<string, unknown>;
			const url = record.url ?? record.src ?? record.thumb;
			if (typeof url === 'string' && url.trim()) {
				const caption = typeof record.caption === 'string' ? record.caption : undefined;
				photos.push({ url: url.trim(), caption });
			}
		}
	}
	return photos;
}

/**
 * A declarative HTTP JSON source. This is the only supported way to plug in an
 * external API: users describe the payload with JSONPath, they do not write code.
 */
export class HttpSource implements DataSource {
	id: string;
	name: string;
	description?: string;
	kind = 'http' as const;

	constructor(private config: HttpSourceConfig) {
		this.id = config.id;
		this.name = config.name || config.id;
		this.description = config.url;
	}

	async load(ctx: SourceContext): Promise<Feature[]> {
		const { config } = this;
		if (!config.url) throw new Error('未配置 API URL');

		const response = await requestUrl({
			url: config.url,
			method: 'GET',
			headers: {
				accept: 'application/json',
				...config.headers,
			},
			throw: false,
		});

		if (response.status >= 400) {
			throw new Error(`HTTP ${response.status}`);
		}

		let payload: unknown;
		try {
			payload = response.json;
		} catch {
			payload = JSON.parse(response.text);
		}

		if (ctx.signal?.aborted) return [];

		const records = getList(payload, config.mapping.list || '$');
		const features: Feature[] = [];

		for (const record of records) {
			if (!record || typeof record !== 'object') continue;
			const lat = getNumber(record, config.mapping.lat);
			const lng = getNumber(record, config.mapping.lng);
			if (lat === undefined || lng === undefined) continue;

			const declared = config.mapping.coordSys
				? getString(record, config.mapping.coordSys)
				: undefined;
			const sys: CoordSys = isCoordSys(declared) ? declared : config.coordSys;

			const id =
				getString(record, config.mapping.id) ??
				stableHash(`${config.id}:${lat}:${lng}:${JSON.stringify(record).slice(0, 120)}`);

			const photos = config.mapping.photos ? toPhotoRefs(getList(record, config.mapping.photos)) : [];

			features.push({
				id: featureId(this.id, id),
				sourceId: this.id,
				name: getString(record, config.mapping.name),
				lat,
				lng,
				coordSys: sys,
				time: normalizeTime(config.mapping.time ? getString(record, config.mapping.time) : undefined),
				category: getString(record, config.mapping.category),
				tags: config.mapping.tags ? getStringList(record, config.mapping.tags) : [],
				photos,
				link: getString(record, config.mapping.link),
				props: { ...(record as Record<string, unknown>) },
			});
		}

		return features;
	}
}

export function createHttpSource(config: HttpSourceConfig): HttpSource {
	return new HttpSource(config);
}
