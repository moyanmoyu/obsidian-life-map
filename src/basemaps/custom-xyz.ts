import type { StyleSpecification } from 'maplibre-gl';
import type { Basemap } from '../core/basemap';
import { openFreeMap, rasterStyle } from './common';

/**
 * Any `{z}/{x}/{y}` raster tile template. This is the escape hatch for
 * self-hosted tiles, corporate tile servers, or providers we do not bundle.
 *
 * The coordinate system is configurable because raster tiles from 高德/腾讯 are
 * GCJ-02, while 天地图/OSM/self-hosted tiles are usually WGS-84.
 */
export const customXyz: Basemap = {
	id: 'custom-xyz',
	name: '自定义瓦片（XYZ 模板）',
	description: '填入任意 {z}/{x}/{y} 瓦片地址，如自建服务或企业瓦片',
	coordSys: 'WGS84',
	getStyle(settings, dark = false): StyleSpecification | string {
		const template = settings.customXyzUrl.trim();
		if (!template) return openFreeMap.getStyle(settings, dark);
		return rasterStyle({
			tiles: [template],
			attribution: settings.customXyzAttribution.trim() || undefined,
			dark,
		});
	},
};
