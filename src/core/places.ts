import type { CoordSys, Feature, PhotoRef } from './model';

/**
 * A place aggregates every visit to (almost) the same coordinate.
 * One place = one marker on the map; each note/record is a sub-entry (`visits`).
 */
export interface PlaceGroup {
	/** Cell key, also used as a stable id for the marker */
	key: string;
	/** Representative coordinate, WGS-84 */
	lat: number;
	lng: number;
	name: string;
	category?: string;
	tags: string[];
	photos: PhotoRef[];
	/** Newest first; records without a time go last */
	visits: Feature[];
	latest?: string;
	/** Source colour of the first visit, used for the marker */
	color?: string;
}

/**
 * ~11 m cells: identical coordinates always merge, small GPS drift usually does
 * too, while neighbouring shops in the same building stay separable.
 */
export function placeKey(lat: number, lng: number): string {
	return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function timeOf(feature: Feature): number {
	if (!feature.time) return Number.NEGATIVE_INFINITY;
	const parsed = Date.parse(feature.time);
	return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function mergeTags(visits: Feature[]): string[] {
	const seen = new Set<string>();
	for (const visit of visits) for (const tag of visit.tags) seen.add(tag);
	return Array.from(seen);
}

function mergePhotos(visits: Feature[], limit = 12): PhotoRef[] {
	const photos: PhotoRef[] = [];
	for (const visit of visits) {
		for (const photo of visit.photos) {
			photos.push(photo);
			if (photos.length >= limit) return photos;
		}
	}
	return photos;
}

/** Assign colours by source id (same palette as the rest of the plugin). */
export function groupPlaces(
	features: Feature[],
	colorBySource: Map<string, string>
): PlaceGroup[] {
	const groups = new Map<string, PlaceGroup>();

	for (const feature of features) {
		const key = placeKey(feature.lat, feature.lng);
		let group = groups.get(key);
		if (!group) {
			group = {
				key,
				lat: feature.lat,
				lng: feature.lng,
				name: feature.name ?? '未命名地点',
				tags: [],
				photos: [],
				visits: [],
				color: colorBySource.get(feature.sourceId),
			};
			groups.set(key, group);
		}
		group.visits.push(feature);
	}

	for (const group of groups.values()) {
		group.visits.sort((a, b) => timeOf(b) - timeOf(a));
		const newest = group.visits[0];
		group.name = newest.name ?? group.name;
		group.category = newest.category;
		group.latest = newest.time;
		group.tags = mergeTags(group.visits);
		group.photos = mergePhotos(group.visits);
		if (!group.color) group.color = colorBySource.get(newest.sourceId);
	}

	return Array.from(groups.values());
}

/** Flatten visits with their place, newest first — used by the timeline tab. */
export interface VisitEntry {
	place: PlaceGroup;
	visit: Feature;
}

export function flattenVisits(places: PlaceGroup[]): VisitEntry[] {
	const entries: VisitEntry[] = [];
	for (const place of places) {
		for (const visit of place.visits) entries.push({ place, visit });
	}
	entries.sort((a, b) => timeOf(b.visit) - timeOf(a.visit));
	return entries;
}

export interface ParsedCoordValue {
	lat: number;
	lng: number;
	sys: CoordSys;
}
