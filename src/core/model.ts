/**
 * Core data model.
 *
 * Everything that reaches the renderer is normalised into `Feature` with
 * WGS-84 coordinates. Sources may hand us GCJ-02 / BD-09 data, but they must
 * declare it via `coordSys`; the service converts before rendering.
 */

export type CoordSys = 'WGS84' | 'GCJ02' | 'BD09';

export interface PhotoRef {
	/** http(s) URL, or a URL produced by `vault.adapter.getResourcePath()` */
	url: string;
	caption?: string;
}

export interface Feature {
	/** Globally unique, `<sourceId>:<rawId>`. Used for de-duplication. */
	id: string;
	sourceId: string;
	name?: string;
	/** WGS-84 latitude after normalisation */
	lat: number;
	/** WGS-84 longitude after normalisation */
	lng: number;
	/** Coordinate system of the *original* data (informational after normalisation) */
	coordSys: CoordSys;
	/** ISO-8601 timestamp, used by the time filter and ordering */
	time?: string;
	category?: string;
	tags: string[];
	photos: PhotoRef[];
	/** Vault path or external URL to open when the marker is clicked */
	link?: string;
	/** Raw properties, kept untouched so nothing is lost */
	props: Record<string, unknown>;
}

export const COORD_SYSTEMS: CoordSys[] = ['WGS84', 'GCJ02', 'BD09'];

export function isCoordSys(value: unknown): value is CoordSys {
	return value === 'WGS84' || value === 'GCJ02' || value === 'BD09';
}
