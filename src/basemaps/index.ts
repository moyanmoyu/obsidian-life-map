import type { Basemap } from '../core/basemap';
import { customXyz } from './custom-xyz';
import { openFreeMap } from './common';
import { tianditu } from './tianditu';

export const BUILTIN_BASEMAPS: Basemap[] = [tianditu, openFreeMap, customXyz];

/** Custom XYZ tiles can be GCJ-02; the basemap object is static, so the
 * coordinate system is resolved from settings at render time. */
export function basemapCoordSys(basemap: Basemap, customXyzCoordSys: 'WGS84' | 'GCJ02' | 'BD09') {
	if (basemap.id === 'custom-xyz') return customXyzCoordSys;
	return basemap.coordSys;
}

export { customXyz, openFreeMap, tianditu };
