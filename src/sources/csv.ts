import type { CoordSys, Feature } from '../core/model';
import type { DataSource, SourceContext } from '../core/source';
import { asString, featureId, isInFolders, normalizeTags, normalizeTime, stableHash } from './helpers';

/** Minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	const input = text.replace(/^\uFEFF/, '');

	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (inQuotes) {
			if (char === '"') {
				if (input[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
			continue;
		}
		if (char === '"') {
			inQuotes = true;
		} else if (char === ',') {
			row.push(field);
			field = '';
		} else if (char === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else if (char === '\r') {
			// skip
		} else {
			field += char;
		}
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

const LAT_KEYS = ['lat', 'latitude', '纬度', 'y'];
const LNG_KEYS = ['lng', 'lon', 'long', 'longitude', '经度', 'x'];
const NAME_KEYS = ['name', 'title', '标题', '名称'];
const TIME_KEYS = ['time', 'date', 'visited_at', 'visited', '时间', '日期'];
const CATEGORY_KEYS = ['category', 'type', '分类', '类型'];
const TAGS_KEYS = ['tags', 'tag', '标签'];
const LINK_KEYS = ['link', 'url', 'path', '链接'];

function findColumn(headers: string[], candidates: string[]): number {
	const normalized = headers.map((h) => h.trim().toLowerCase());
	for (const candidate of candidates) {
		const index = normalized.indexOf(candidate);
		if (index >= 0) return index;
	}
	return -1;
}

export class CsvSource implements DataSource {
	id = 'csv';
	name = 'CSV 文件';
	description = '读取 vault 内所有 .csv 文件中带 lat/lng 列的行';
	kind = 'builtin' as const;

	async load(ctx: SourceContext): Promise<Feature[]> {
		const { app, settings } = ctx;
		const files = app.vault
			.getFiles()
			.filter((file) => file.extension.toLowerCase() === 'csv')
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
			features.push(...this.extract(text, file.path, settings.vault.coordSys));
		}
		return features;
	}

	private extract(text: string, path: string, defaultSys: CoordSys): Feature[] {
		const rows = parseCsv(text);
		if (rows.length < 2) return [];
		const headers = rows[0];
		const latCol = findColumn(headers, LAT_KEYS);
		const lngCol = findColumn(headers, LNG_KEYS);
		if (latCol < 0 || lngCol < 0) return [];

		const nameCol = findColumn(headers, NAME_KEYS);
		const timeCol = findColumn(headers, TIME_KEYS);
		const categoryCol = findColumn(headers, CATEGORY_KEYS);
		const tagsCol = findColumn(headers, TAGS_KEYS);
		const linkCol = findColumn(headers, LINK_KEYS);
		const coordSysCol = findColumn(headers, ['coord_sys', 'coordsys', '坐标系']);

		const features: Feature[] = [];
		for (let i = 1; i < rows.length; i++) {
			const row = rows[i];
			const lat = Number(row[latCol]);
			const lng = Number(row[lngCol]);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

			const name = nameCol >= 0 ? asString(row[nameCol]) : undefined;
			const rawId = stableHash(`${path}:${i}:${lat}:${lng}`);
			const props: Record<string, unknown> = { file: path, row: i };
			headers.forEach((header, index) => {
				props[header] = row[index];
			});

			const declared = coordSysCol >= 0 ? asString(row[coordSysCol]) : undefined;
			const sys: CoordSys =
				declared === 'WGS84' || declared === 'GCJ02' || declared === 'BD09' ? declared : defaultSys;

			features.push({
				id: featureId(this.id, rawId),
				sourceId: this.id,
				name,
				lat,
				lng,
				coordSys: sys,
				time: timeCol >= 0 ? normalizeTime(row[timeCol]) : undefined,
				category: categoryCol >= 0 ? asString(row[categoryCol]) : undefined,
				tags: tagsCol >= 0 ? normalizeTags((row[tagsCol] ?? '').split(/[;|,]/)) : [],
				photos: [],
				link: linkCol >= 0 ? asString(row[linkCol]) : path,
				props,
			});
		}
		return features;
	}
}
