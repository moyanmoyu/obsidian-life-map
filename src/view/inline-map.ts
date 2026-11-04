import {
	MarkdownRenderChild,
	TFile,
	parseYaml,
	type EventRef,
	type MarkdownPostProcessorContext,
} from 'obsidian';
import maplibregl, {
	type GeoJSONSource,
	type Map as MapLibreMap,
	type MapLayerMouseEvent,
	type StyleSpecification,
} from 'maplibre-gl';
import { basemapCoordSys } from '../basemaps';
import { resolveBasemap } from '../basemaps/common';
import { CLUSTER_COLOR, POINT_DEFAULT_COLOR } from '../constants';
import { fromWGS84, toWGS84 } from '../core/coords';
import type { Feature } from '../core/model';
import { groupPlaces } from '../core/places';
import type LifeMapPlugin from '../main';
import type { MapViewIntent } from '../main';
import { readCoords } from '../sources/vault-frontmatter';

const SOURCE_ID = 'life-map-inline-points';
const LAYER_POINTS = 'life-map-inline-circle';

/** Hard cap: every map is a WebGL context, and there are not many of those. */
const MAX_INLINE_MAPS = 6;

interface InlineOptions {
	/** Explicit center as `[lat, lng]` */
	center?: [number, number];
	zoom: number;
	height: number;
	limit: number;
	/** Only show features carrying this tag */
	tag?: string;
	interactive: boolean;
}

function parsePair(value: unknown): [number, number] | undefined {
	if (Array.isArray(value) && value.length >= 2) {
		const lat = Number(value[0]);
		const lng = Number(value[1]);
		if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
	}
	if (typeof value === 'string') {
		const parts = value.split(',').map((part) => Number(part.trim()));
		if (parts.length >= 2 && parts.every((part) => Number.isFinite(part))) {
			return [parts[0], parts[1]];
		}
	}
	return undefined;
}

function parseOptions(source: string): InlineOptions {
	let raw: Record<string, unknown> = {};
	try {
		const parsed: unknown = parseYaml(source);
		if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
	} catch {
		// A malformed block should never break the note preview.
	}

	const zoom = Number(raw['zoom']);
	const height = Number(raw['height']);
	const limit = Number(raw['limit']);

	return {
		center: parsePair(raw['center'] ?? raw['coords']),
		zoom: Number.isFinite(zoom) ? Math.min(Math.max(zoom, 1), 18) : 13,
		height: Number.isFinite(height) ? Math.min(Math.max(height, 120), 600) : 260,
		limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 5000) : 1000,
		tag: typeof raw['tag'] === 'string' ? raw['tag'].replace(/^#/, '') : undefined,
		interactive: raw['interactive'] !== false,
	};
}

function styleFor(plugin: LifeMapPlugin): StyleSpecification | string {
	const settings = plugin.settings;
	const basemap = resolveBasemap(settings, plugin.registry.getBasemaps());
	const dark = settings.followTheme && document.body.classList.contains('theme-dark');
	return basemap?.getStyle(settings, dark) ?? '';
}

/**
 * Renders a compact map inside a ```life-map``` code block.
 * Returns a cleanup function; Obsidian calls it when the block is unloaded.
 */
export function renderInlineMap(
	plugin: LifeMapPlugin,
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext
): void {
	const options = parseOptions(source);
	const container = el.createDiv({ cls: 'life-map-inline' });
	container.style.height = `${options.height}px`;

	if (plugin.inlineMapCount >= MAX_INLINE_MAPS) {
		container.createDiv({
			cls: 'life-map-inline-limit',
			text: `同时渲染的地图超过 ${MAX_INLINE_MAPS} 个，已跳过。折叠其他笔记后再试。`,
		});
		return;
	}
	plugin.inlineMapCount++;

	const mapEl = container.createDiv({ cls: 'life-map-inline-map' });
	let map: MapLibreMap | null = null;

	const openButton = container.createEl('button', {
		cls: 'life-map-inline-open',
		text: '打开完整地图',
	});
	openButton.addEventListener('click', (event) => {
		event.stopPropagation();
		void plugin.activateView(buildIntent());
	});

	/** Carry the inline map's current view and tag into the full map view. */
	const buildIntent = (): MapViewIntent => {
		const intent: MapViewIntent = {};
		if (options.tag) intent.tag = options.tag;
		if (!map) return intent;

		const settings = plugin.settings;
		const basemap = resolveBasemap(settings, plugin.registry.getBasemaps());
		const targetSys = basemap ? basemapCoordSys(basemap, settings.customXyzCoordSys) : 'WGS84';

		const uiCenter = map.getCenter();
		intent.center = toWGS84(uiCenter.lat, uiCenter.lng, targetSys);
		intent.zoom = map.getZoom();

		const bounds = map.getBounds();
		const northWest = toWGS84(bounds.getNorth(), bounds.getWest(), targetSys);
		const southEast = toWGS84(bounds.getSouth(), bounds.getEast(), targetSys);
		const padLat = Math.abs(northWest[0] - southEast[0]) * 0.05;
		const padLng = Math.abs(southEast[1] - northWest[1]) * 0.05;
		intent.bbox = [
			Math.min(northWest[1], southEast[1]) - padLng,
			Math.min(northWest[0], southEast[0]) - padLat,
			Math.max(northWest[1], southEast[1]) + padLng,
			Math.max(northWest[0], southEast[0]) + padLat,
		];
		return intent;
	};
	let observer: ResizeObserver | null = null;
	let themeRef: EventRef | null = null;
	let destroyed = false;

	const ownCoords = () => {
		const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return null;
		const cache = plugin.app.metadataCache.getFileCache(file);
		return readCoords(cache?.frontmatter as Record<string, unknown> | undefined, plugin.settings.vault);
	};

	const buildFeatures = (targetSys: 'WGS84' | 'GCJ02' | 'BD09') => {
		const own = ownCoords();
		// Note coordinates carry their own coordinate system (usually GCJ-02 from
		// 高德). Normalise to WGS-84 before projecting onto the basemap.
		const ownWgs = own ? toWGS84(own.lat, own.lng, own.sys) : null;

		const collected: Feature[] = [];
		for (const result of plugin.results) {
			for (const feature of result.features) {
				if (options.tag && !feature.tags.includes(options.tag)) continue;
				collected.push(feature);
				if (collected.length >= options.limit) break;
			}
			if (collected.length >= options.limit) break;
		}

		// Aggregate by place: several notes at the same spot become one marker.
		const places = groupPlaces(collected, new Map());

		let matchedOwn = false;
		const points = places.map((place) => {
			const isOwn = place.visits.some((visit) => visit.link === ctx.sourcePath);
			if (isOwn) matchedOwn = true;
			return {
				place,
				own: isOwn,
				lngLat: fromWGS84(place.lat, place.lng, targetSys),
			};
		});

		// Only when the note's POI is not part of the dataset (e.g. excluded by
		// tag filter) do we add a standalone marker for the note itself.
		const extraOwn =
			ownWgs && !matchedOwn ? fromWGS84(ownWgs[0], ownWgs[1], targetSys) : null;

		return { points, extraOwn };
	};

	const showFailure = (message: string, retry?: () => void): void => {
		mapEl.empty();
		const box = container.createDiv({ cls: 'life-map-inline-limit' });
		box.createDiv({ text: message });
		if (retry) {
			const button = box.createEl('button', { cls: 'life-map-inline-retry', text: '重试' });
			button.addEventListener('click', (event) => {
				event.stopPropagation();
				box.remove();
				retry();
			});
		}
	};

	const addData = () => {
		if (!map) return;
		try {
			populate();
		} catch (error) {
			console.error('[life-map] inline map data failed', error);
			showFailure('数据渲染失败，点此查看控制台详情', () => addData());
		}
	};

	const populate = () => {
		if (!map) return;
		const settings = plugin.settings;
		const basemap = resolveBasemap(settings, plugin.registry.getBasemaps());
		const targetSys = basemap ? basemapCoordSys(basemap, settings.customXyzCoordSys) : 'WGS84';
		const { points, extraOwn } = buildFeatures(targetSys);

		const geojson = {
			type: 'FeatureCollection' as const,
			features: points.map((point, index) => ({
				type: 'Feature' as const,
				geometry: { type: 'Point' as const, coordinates: point.lngLat },
				properties: {
					index,
					kind: point.own ? 'own' : 'poi',
					count: point.place.visits.length,
					color: point.own
						? '#e5484d'
						: point.place.color ?? POINT_DEFAULT_COLOR,
				},
			})),
		};
		if (extraOwn) {
			geojson.features.push({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: extraOwn },
				properties: { index: -1, kind: 'own', color: '#e5484d' },
			} as never);
		}

		const existing = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
		if (existing) {
			existing.setData(geojson as never);
			return;
		}

		if (geojson.features.length === 0) {
			container.createDiv({
				cls: 'life-map-inline-empty',
				text: options.tag ? `没有带标签「${options.tag}」的地点` : '当前没有可显示的地点',
			});
		}

		map.addSource(SOURCE_ID, {
			type: 'geojson',
			data: geojson as never,
			cluster: true,
			clusterRadius: 40,
			clusterMaxZoom: 13,
		});
		map.addLayer({
			id: 'life-map-inline-clusters',
			type: 'circle',
			source: SOURCE_ID,
			filter: ['has', 'point_count'],
			paint: {
				'circle-color': CLUSTER_COLOR,
				'circle-radius': ['step', ['get', 'point_count'], 11, 10, 15, 50, 19],
				'circle-stroke-width': 1.5,
				'circle-stroke-color': '#ffffff',
				'circle-opacity': 0.9,
			},
		});
		// A single layer with data-driven styling: boolean feature filters were
		// fragile across MapLibre versions, so the note's own point is styled by
		// the `kind` property instead of living in a separate filtered layer.
		map.addLayer({
			id: LAYER_POINTS,
			type: 'circle',
			source: SOURCE_ID,
			paint: {
				'circle-color': ['case', ['==', ['get', 'kind'], 'own'], '#e5484d', ['get', 'color']],
				'circle-radius': ['case', ['==', ['get', 'kind'], 'own'], 6.5, 4],
				'circle-stroke-width': ['case', ['==', ['get', 'kind'], 'own'], 2, 1.5],
				'circle-stroke-color': '#ffffff',
			},
		});

		const handlePointClick = (event: MapLayerMouseEvent) => {
			const feature = event.features?.[0];
			if (!feature || feature.geometry.type !== 'Point') return;
			const coordinates = feature.geometry.coordinates as [number, number];
			const index = Number(feature.properties?.index ?? -1);
			const point = points[index];
			const link = point?.place.visits[0]?.link;

			// A different note: navigate to it.
			if (link && link !== ctx.sourcePath) {
				void plugin.app.workspace.openLinkText(link, '', false);
				return;
			}

			// The note that hosts this map (or a POI without a link): opening the
			// same note again is a no-op, so jump to the full map instead.
			const settings = plugin.settings;
			const basemap = resolveBasemap(settings, plugin.registry.getBasemaps());
			const targetSys = basemap ? basemapCoordSys(basemap, settings.customXyzCoordSys) : 'WGS84';
			const center = toWGS84(coordinates[1], coordinates[0], targetSys);
			void plugin.activateView({
				center,
				zoom: Math.max(map?.getZoom() ?? 14, 14),
				tag: options.tag,
			});
		};

		map.on('click', LAYER_POINTS, handlePointClick);
		map.on('mouseenter', LAYER_POINTS, () => {
			map?.getCanvas().classList.add('life-map-pointer');
		});
		map.on('mouseleave', LAYER_POINTS, () => {
			map?.getCanvas().classList.remove('life-map-pointer');
		});
	};

	const create = () => {
		if (destroyed) return;
		try {
			createMap();
		} catch (error) {
			console.error('[life-map] inline map init failed', error);
			plugin.inlineMapCount = Math.max(0, plugin.inlineMapCount - 1);
			showFailure('地图初始化失败（可能是 WebGL 上下文被用尽），关闭其他笔记后重试', () => {
				plugin.inlineMapCount++;
				create();
			});
		}
	};

	const createMap = () => {
		if (destroyed) return;
		const basemap = resolveBasemap(plugin.settings, plugin.registry.getBasemaps());
		if (!basemap) {
			container.createDiv({ cls: 'life-map-inline-limit', text: '没有可用的底图' });
			return;
		}
		const basemapSys = basemapCoordSys(basemap, plugin.settings.customXyzCoordSys);

		// Prefer an explicit center, then the note's own coordinates.
		const own = ownCoords();
		let centerLatLng: [number, number] = [35.86, 104.2];
		let zoom = 4;
		if (options.center) {
			// Explicit `center` is documented as WGS-84.
			centerLatLng = options.center;
			zoom = options.zoom;
		} else if (own) {
			centerLatLng = toWGS84(own.lat, own.lng, own.sys);
			zoom = options.zoom;
		}
		const center = fromWGS84(centerLatLng[0], centerLatLng[1], basemapSys);

		map = new maplibregl.Map({
			container: mapEl,
			style: styleFor(plugin),
			center: [center[1], center[0]],
			zoom,
			maxZoom: 18,
			interactive: options.interactive,
			attributionControl: false,
		});
		map.on('load', addData);
		map.on('error', (event) => {
			console.warn('[life-map] inline map error', event?.error ?? event);
		});
		map.on('webglcontextlost', () => {
			console.warn('[life-map] inline map WebGL context lost');
			showFailure('WebGL 上下文丢失，重新打开笔记即可恢复');
		});

		observer = new ResizeObserver(() => map?.resize());
		observer.observe(container);

		themeRef = plugin.app.workspace.on('css-change', () => {
			if (!map) return;
			map.setStyle(styleFor(plugin));
			window.setTimeout(() => {
				if (map?.isStyleLoaded()) addData();
			}, 200);
		});
	};

	window.setTimeout(() => {
		void (async () => {
			if (plugin.results.length === 0) await plugin.refreshFeatures();
			create();
		})();
	}, 0);

	const cleanup = () => {
		destroyed = true;
		plugin.inlineMapCount = Math.max(0, plugin.inlineMapCount - 1);
		observer?.disconnect();
		observer = null;
		if (themeRef) plugin.app.workspace.offref(themeRef);
		themeRef = null;
		map?.remove();
		map = null;
	};

	// Obsidian unloads this child when the code block is removed from the DOM,
	// which is where we release the WebGL context.
	ctx.addChild(new InlineMapChild(container, cleanup));
}

class InlineMapChild extends MarkdownRenderChild {
	private readonly cleanup: () => void;

	constructor(containerEl: HTMLElement, cleanup: () => void) {
		super(containerEl);
		this.cleanup = cleanup;
	}

	onunload(): void {
		this.cleanup();
	}
}
