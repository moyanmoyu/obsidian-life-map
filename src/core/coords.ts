/**
 * Coordinate transforms between WGS-84, GCJ-02 (高德/腾讯) and BD-09 (百度).
 *
 * The classic "evil" transform. Implemented locally so the plugin has no
 * third-party runtime dependency for this. Formulas are the widely documented
 * public ones (see https://github.com/wandergis/coordTransform).
 */
import type { CoordSys } from './model';

const PI = Math.PI;
const A = 6378245.0;
const EE = 6.693421622965943e-3;
const X_PI = (PI * 3000.0) / 180.0;

/** Roughly mainland China; outside this box no offset is applied. */
function outOfChina(lng: number, lat: number): boolean {
	return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}

function transformLat(lng: number, lat: number): number {
	let ret =
		-100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
	ret += ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0) / 3.0;
	ret += ((20.0 * Math.sin(lat * PI) + 40.0 * Math.sin((lat / 3.0) * PI)) * 2.0) / 3.0;
	ret += ((160.0 * Math.sin((lat / 12.0) * PI) + 320 * Math.sin((lat * PI) / 30.0)) * 2.0) / 3.0;
	return ret;
}

function transformLng(lng: number, lat: number): number {
	let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
	ret += ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0) / 3.0;
	ret += ((20.0 * Math.sin(lng * PI) + 40.0 * Math.sin((lng / 3.0) * PI)) * 2.0) / 3.0;
	ret += ((150.0 * Math.sin((lng / 12.0) * PI) + 300.0 * Math.sin((lng / 30.0) * PI)) * 2.0) / 3.0;
	return ret;
}

/** WGS-84 -> GCJ-02 */
export function wgs84ToGcj02(lat: number, lng: number): [number, number] {
	if (outOfChina(lng, lat)) return [lat, lng];
	let dLat = transformLat(lng - 105.0, lat - 35.0);
	let dLng = transformLng(lng - 105.0, lat - 35.0);
	const radLat = (lat / 180.0) * PI;
	let magic = Math.sin(radLat);
	magic = 1 - EE * magic * magic;
	const sqrtMagic = Math.sqrt(magic);
	dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
	dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
	return [lat + dLat, lng + dLng];
}

/** GCJ-02 -> WGS-84 (iterative inverse, sub-metre after 3 rounds) */
export function gcj02ToWgs84(lat: number, lng: number): [number, number] {
	if (outOfChina(lng, lat)) return [lat, lng];
	let wgsLat = lat;
	let wgsLng = lng;
	for (let i = 0; i < 3; i++) {
		const [gLat, gLng] = wgs84ToGcj02(wgsLat, wgsLng);
		wgsLat += lat - gLat;
		wgsLng += lng - gLng;
	}
	return [wgsLat, wgsLng];
}

export function gcj02ToBd09(lat: number, lng: number): [number, number] {
	const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
	const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI);
	return [z * Math.sin(theta) + 0.006, z * Math.cos(theta) + 0.0065];
}

export function bd09ToGcj02(lat: number, lng: number): [number, number] {
	const x = lng - 0.0065;
	const y = lat - 0.006;
	const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
	const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
	return [z * Math.sin(theta), z * Math.cos(theta)];
}

/** Convert any supported system to WGS-84. */
export function toWGS84(lat: number, lng: number, sys: CoordSys): [number, number] {
	switch (sys) {
		case 'GCJ02':
			return gcj02ToWgs84(lat, lng);
		case 'BD09':
			return gcj02ToWgs84(...bd09ToGcj02(lat, lng));
		default:
			return [lat, lng];
	}
}

/** Convert WGS-84 to the target system. */
export function fromWGS84(lat: number, lng: number, sys: CoordSys): [number, number] {
	switch (sys) {
		case 'GCJ02':
			return wgs84ToGcj02(lat, lng);
		case 'BD09':
			return gcj02ToBd09(...wgs84ToGcj02(lat, lng));
		default:
			return [lat, lng];
	}
}
