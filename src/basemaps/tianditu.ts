import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { Basemap } from '../core/basemap';
import { darkVeilLayer, openFreeMap } from './common';

const SUBDOMAINS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * WMTS TileMatrixSet `w` is Web Mercator, which is what MapLibre expects.
 * `{z}/{y}/{x}` placeholders are substituted by MapLibre inside the query.
 */
function wmtsUrls(layer: string, key: string): string[] {
	const token = encodeURIComponent(key);
	return SUBDOMAINS.map(
		(sub) =>
			`https://t${sub}.tianditu.gov.cn/${layer}_w/wmts` +
			`?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
			`&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
			`&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${token}`
	);
}

/**
 * 天地图 — the compliant, free option for mainland China.
 *
 * Note: 天地图 gates the "浏览器端" key type on the User-Agent, not on Referer.
 * Obsidian runs in Electron with a Chromium UA, so the browser key works.
 */
export const tianditu: Basemap = {
	id: 'tianditu',
	name: '天地图（国内合规，需 tk）',
	description: '国家地理信息公共服务平台；需申请 tk，国内访问稳定',
	coordSys: 'WGS84',
	requiresKey: true,
	attribution: '© 天地图',
	getStyle(settings, dark = false): StyleSpecification | string {
		const key = settings.tiandituKey.trim();
		if (!key) {
			// No key yet: render something usable instead of an empty canvas.
			return openFreeMap.getStyle(settings, dark);
		}

		const layers: LayerSpecification[] = [
			{
				id: 'background',
				type: 'background',
				paint: { 'background-color': '#f2f4f6' },
			},
			{ id: 'td-vec', type: 'raster', source: 'td-vec' },
			{ id: 'td-cva', type: 'raster', source: 'td-cva' },
		] as LayerSpecification[];

		if (dark) layers.push(darkVeilLayer(0.5));

		return {
			version: 8,
			sources: {
				'td-vec': {
					type: 'raster',
					tiles: wmtsUrls('vec', key),
					tileSize: 256,
					maxzoom: 18,
					attribution: '© 天地图',
				},
				'td-cva': {
					type: 'raster',
					tiles: wmtsUrls('cva', key),
					tileSize: 256,
					maxzoom: 18,
				},
			},
			layers,
		} as StyleSpecification;
	},
};
