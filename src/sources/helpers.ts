import { App, TFile } from 'obsidian';
import type { Feature, PhotoRef } from '../core/model';

/** Coerce a frontmatter value into a string list. */
export function asStringArray(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	if (Array.isArray(value)) {
		return value
			.map((v) => (typeof v === 'object' && v !== null ? undefined : String(v).trim()))
			.filter((v): v is string => !!v && v.length > 0);
	}
	if (typeof value === 'object') return [];
	const str = String(value).trim();
	return str.length > 0 ? [str] : [];
}

/** Coerce a frontmatter value into a string. */
export function asString(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === 'object') return undefined;
	const str = String(value).trim();
	return str.length > 0 ? str : undefined;
}

/** Normalise dates/numbers into an ISO-8601 string when possible. */
export function normalizeTime(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value.toISOString();
	if (typeof value === 'number') {
		const ms = value > 1e12 ? value : value * 1000;
		const date = new Date(ms);
		return isNaN(date.getTime()) ? undefined : date.toISOString();
	}
	const str = asString(value);
	if (!str) return undefined;
	const date = new Date(str);
	return isNaN(date.getTime()) ? str : date.toISOString();
}

/**
 * Turn an arbitrary photo reference (wikilink, vault path, URL) into something
 * an `<img>` can load.
 */
export function resolvePhotoUrl(app: App, raw: string): string | undefined {
	const value = raw.trim();
	if (!value) return undefined;
	if (/^(https?:|data:)/i.test(value)) return value;

	const cleaned = value
		.replace(/^!?\[\[/, '')
		.replace(/\]\]$/, '')
		.split('|')[0]
		.trim();
	if (!cleaned) return undefined;

	const dest = app.metadataCache.getFirstLinkpathDest(cleaned, '');
	if (dest) return app.vault.adapter.getResourcePath(dest.path);

	const direct = app.vault.getAbstractFileByPath(cleaned);
	if (direct instanceof TFile) return app.vault.adapter.getResourcePath(direct.path);

	return undefined;
}

/** Collect photo refs from a frontmatter-ish value (string, array, or objects). */
export function toPhotoRefs(app: App, value: unknown): PhotoRef[] {
	if (value === undefined || value === null) return [];
	const items = Array.isArray(value) ? value : [value];
	const photos: PhotoRef[] = [];
	for (const item of items) {
		let raw: string | undefined;
		let caption: string | undefined;
		if (typeof item === 'string') {
			raw = item;
		} else if (item && typeof item === 'object') {
			const record = item as Record<string, unknown>;
			raw = asString(record.url ?? record.src ?? record.path ?? record.thumb);
			caption = asString(record.caption ?? record.alt);
		}
		if (!raw) continue;
		const url = resolvePhotoUrl(app, raw);
		if (url) photos.push({ url, caption });
	}
	return photos;
}

/** Build the `sourceId:rawId` feature id. */
export function featureId(sourceId: string, rawId: string): string {
	return `${sourceId}:${rawId}`;
}

/** Small stable hash for records without an id. */
export function stableHash(value: string): string {
	let hash = 5381;
	for (let i = 0; i < value.length; i++) {
		hash = (hash * 33) ^ value.charCodeAt(i);
	}
	return (hash >>> 0).toString(36);
}

/** Merge tag sources, strip leading `#`, dedupe. */
export function normalizeTags(...lists: (string[] | undefined)[]): string[] {
	const seen = new Set<string>();
	for (const list of lists) {
		for (const tag of list ?? []) {
			const cleaned = tag.trim().replace(/^#/, '');
			if (cleaned) seen.add(cleaned);
		}
	}
	return Array.from(seen);
}

/** Path check used by folder filters. */
export function isInFolders(path: string, folders: string[]): boolean {
	if (folders.length === 0) return true;
	const normalized = path.toLowerCase();
	return folders.some((folder) => {
		const f = folder.replace(/^\/+|\/+$/g, '').toLowerCase();
		if (!f) return true;
		return normalized === f || normalized.startsWith(`${f}/`);
	});
}

/** Type guard helper for feature arrays returned by extension sources. */
export function isFeature(value: unknown): value is Feature {
	if (!value || typeof value !== 'object') return false;
	const f = value as Record<string, unknown>;
	return typeof f.id === 'string' && typeof f.lat === 'number' && typeof f.lng === 'number';
}
