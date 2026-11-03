import type { StyleSpecification } from 'maplibre-gl';
import type { CoordSys } from './model';
import type { LifeMapSettings } from '../settings';

export interface Basemap {
	id: string;
	name: string;
	description?: string;
	/** Coordinate system the tiles are drawn in */
	coordSys: CoordSys;
	/** True when the basemap needs a key in settings before it can render */
	requiresKey?: boolean;
	attribution?: string;
	/**
	 * Return either a MapLibre style URL or a full style object.
	 * `dark` is true when the user's theme is dark and the "dark basemap"
	 * setting is on; implementations may ignore it.
	 */
	getStyle(settings: LifeMapSettings, dark?: boolean): StyleSpecification | string;
}
