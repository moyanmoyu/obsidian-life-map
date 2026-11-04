import type { CoordSys } from './core/model';

export interface PlaceNoteValues {
	name: string;
	lat: number;
	lng: number;
	coordSys: CoordSys;
	category?: string;
}

/** Remove characters that are illegal in filenames on any platform. */
export function sanitizeFileName(name: string): string {
	const cleaned = name
		.replace(/[\\/:*?"<>|#^]/g, ' ')
		.replace(/[[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return cleaned.length > 0 ? cleaned.slice(0, 80) : '未命名地点';
}

/**
 * The note template written by "新建地点笔记": coordinates in frontmatter plus
 * an inline map block, so the note is immediately usable both on the map and
 * inside the note.
 */
export function buildPlaceNoteContent(values: PlaceNoteValues): string {
	const lines: string[] = [
		'---',
		`coordinates: ["${values.lat.toFixed(6)}", "${values.lng.toFixed(6)}"]`,
		`coord_sys: ${values.coordSys}`,
		`title: ${JSON.stringify(values.name)}`,
	];
	if (values.category && values.category.trim()) {
		lines.push(`category: ${JSON.stringify(values.category.trim())}`);
	}
	lines.push('tags:', '  - life/places', '---', '', '## 地图', '', '```life-map', '```', '');

	return lines.join('\n');
}
