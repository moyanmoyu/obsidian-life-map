import type { CoordSys, Feature } from '../core/model';
import { isCoordSys } from '../core/model';
import type { DataSource, SourceContext } from '../core/source';
import type { VaultSourceSettings } from '../settings';
import {
	asString,
	asStringArray,
	featureId,
	isInFolders,
	normalizeTags,
	normalizeTime,
	toPhotoRefs,
} from './helpers';

export interface ParsedCoords {
	lat: number;
	lng: number;
	sys: CoordSys;
}

function parseCoordValue(value: unknown): [number, number] | null {
	if (value === undefined || value === null) return null;
	if (Array.isArray(value) && value.length >= 2) {
		const lat = Number(value[0]);
		const lng = Number(value[1]);
		return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
	}
	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const lat = Number(record.lat ?? record.latitude);
		const lng = Number(record.lng ?? record.lon ?? record.longitude);
		return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
	}
	if (typeof value === 'string') {
		const parts = value.split(',').map((p) => Number(p.trim()));
		if (parts.length >= 2 && parts.every((p) => Number.isFinite(p))) {
			return [parts[0], parts[1]];
		}
	}
	return null;
}

export function readCoords(
	fm: Record<string, unknown> | undefined,
	settings: VaultSourceSettings
): ParsedCoords | null {
	if (!fm) return null;
	const declared = fm[settings.coordSysProperty];
	const sys: CoordSys = isCoordSys(declared) ? declared : settings.coordSys;

	let pair = parseCoordValue(fm[settings.coordsProperty]);
	if (!pair) {
		const lat = Number(fm[settings.latProperty]);
		const lng = Number(fm[settings.lngProperty]);
		if (Number.isFinite(lat) && Number.isFinite(lng)) pair = [lat, lng];
	}
	if (!pair) return null;

	return { lat: pair[0], lng: pair[1], sys };
}

export class VaultFrontmatterSource implements DataSource {
	id = 'vault';
	name = '笔记属性';
	description = '把带经纬度属性的笔记画在地图上';
	kind = 'builtin' as const;

	async load(ctx: SourceContext): Promise<Feature[]> {
		const { app, settings } = ctx;
		const vaultSettings = settings.vault;
		const features: Feature[] = [];

		for (const file of app.vault.getMarkdownFiles()) {
			if (!isInFolders(file.path, vaultSettings.folders)) continue;

			const cache = app.metadataCache.getFileCache(file);
			const fm: Record<string, unknown> | undefined = cache?.frontmatter;
			if (!fm) continue;

			const coords = readCoords(fm, vaultSettings);
			if (!coords) continue;

			const noteTags = normalizeTags(
				asStringArray(fm[vaultSettings.tagsProperty]),
				cache?.tags?.map((t) => t.tag)
			);
			if (vaultSettings.requiredTags.length > 0) {
				const wanted = vaultSettings.requiredTags.map((t) => t.replace(/^#/, ''));
				if (!noteTags.some((tag) => wanted.includes(tag))) continue;
			}

			const photos = [
				...toPhotoRefs(app, fm[vaultSettings.coverProperty]),
				...toPhotoRefs(app, fm[vaultSettings.photosProperty]),
			];

			features.push({
				id: featureId(this.id, file.path),
				sourceId: this.id,
				name: asString(fm[vaultSettings.nameProperty]) ?? file.basename,
				lat: coords.lat,
				lng: coords.lng,
				coordSys: coords.sys,
				time: normalizeTime(fm[vaultSettings.timeProperty]),
				category: asString(fm[vaultSettings.categoryProperty]),
				tags: noteTags,
				photos,
				link: file.path,
				props: { ...fm, file: file.path },
			});
		}

		return features;
	}
}
