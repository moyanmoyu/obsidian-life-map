import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { Basemap } from '../core/basemap';
import type { LifeMapSettings } from '../settings';

const OPEN_FREE_MAP_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const OPEN_FREE_MAP_DARK = 'https://tiles.openfreemap.org/styles/dark';

/** Free, key-less vector basemap (OpenFreeMap). Best outside mainland China. */
export const openFreeMap: Basemap = {
	id: 'openfreemap',
	name: 'OpenFreeMap（免 Key，海外访问快）',
	description: 'OpenStreetMap 数据，无需申请 Key；国内访问可能偏慢',
	coordSys: 'WGS84',
	attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
	getStyle(_settings, dark = false): StyleSpecification | string {
		return dark ? OPEN_FREE_MAP_DARK : OPEN_FREE_MAP_LIGHT;
	},
};

/**
 * A translucent dark veil, inserted above the raster tiles but below the
 * marker layers. This is how we get a dark basemap out of light-only raster
 * providers without a CSS filter (a filter would also invert our markers).
 */
export function darkVeilLayer(opacity = 0.48): LayerSpecification {
	return {
		id: 'life-map-dark-veil',
		type: 'background',
		paint: { 'background-color': `rgba(12, 15, 20, ${opacity})` },
	} as LayerSpecification;
}

/** Build a single-layer raster style (used by custom XYZ / WMTS basemaps). */
export function rasterStyle(options: {
	tiles: string[];
	attribution?: string;
	background?: string;
	maxzoom?: number;
	dark?: boolean;
}): StyleSpecification {
	const sourceId = 'raster-base';
	const layers: LayerSpecification[] = [
		{
			id: 'background',
			type: 'background',
			paint: { 'background-color': options.background ?? '#eceff1' },
		},
		{ id: 'raster-base', type: 'raster', source: sourceId },
	] as LayerSpecification[];

	if (options.dark) layers.push(darkVeilLayer());

	return {
		version: 8,
		sources: {
			[sourceId]: {
				type: 'raster',
				tiles: options.tiles,
				tileSize: 256,
				maxzoom: options.maxzoom ?? 19,
				attribution: options.attribution,
			},
		},
		layers,
	} as StyleSpecification;
}

export function resolveBasemap(
	settings: LifeMapSettings,
	basemaps: Basemap[]
): Basemap | undefined {
	return basemaps.find((b) => b.id === settings.basemapId) ?? basemaps[0];
}
