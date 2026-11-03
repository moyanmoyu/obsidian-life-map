import { ItemView, Notice, TFile, setIcon, type WorkspaceLeaf } from 'obsidian';
import maplibregl, {
	type GeoJSONSource,
	type Map as MapLibreMap,
	type MapLayerMouseEvent,
	type Popup as MapLibrePopup,
	type StyleSpecification,
} from 'maplibre-gl';
import { basemapCoordSys } from '../basemaps';
import { resolveBasemap } from '../basemaps/common';
import {
	CLUSTER_COLOR,
	EXAMPLE_FRONTMATTER,
	LAYER_CLUSTERS,
	LAYER_POINTS,
	POINT_DEFAULT_COLOR,
	SOURCE_ID,
	VIEW_TYPE_LIFE_MAP,
} from '../constants';
import { fromWGS84 } from '../core/coords';
import type { Feature, PhotoRef } from '../core/model';
import { groupPlaces, type PlaceGroup } from '../core/places';
import type LifeMapPlugin from '../main';
import type { MapViewIntent } from '../main';
import { Sidebar } from './sidebar';
import { ConfirmDeleteModal } from '../ui/confirm-delete';

export class LifeMapView extends ItemView {
	private readonly plugin: LifeMapPlugin;

	private map: MapLibreMap | null = null;
	private mapEl!: HTMLElement;
	private sidebar!: Sidebar;
	private reopenButton!: HTMLElement;
	private bannerEl!: HTMLElement;
	private chipsEl!: HTMLElement;
	private filterBarEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private emptyEl!: HTMLElement;
	private searchInput!: HTMLInputElement;
	private fromInput!: HTMLInputElement;
	private toInput!: HTMLInputElement;

	private places: PlaceGroup[] = [];
	private placeLngLat: [number, number][] = [];
	private hiddenSources = new Set<string>();
	private search = '';
	private from = '';
	private to = '';
	private styleSignature = '';
	private interactionsBound = false;
	private repaintTimer: number | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private popup: MapLibrePopup | null = null;
	private activeIndex: number | null = null;
	private tagFilter: string | null = null;
	private bboxFilter: [number, number, number, number] | null = null;
	private colorBySource = new Map<string, string>();
	private haystackCache = new WeakMap<Feature, string>();
	private lightboxEl: HTMLElement | null = null;
	private lightboxImage: HTMLImageElement | null = null;
	private lightboxCaption: HTMLElement | null = null;
	private lightboxCounter: HTMLElement | null = null;
	private lightboxPhotos: PhotoRef[] = [];
	private lightboxIndex = 0;
	private lightboxKeyHandler: ((event: KeyboardEvent) => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LifeMapPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_LIFE_MAP;
	}

	getDisplayText(): string {
		return 'Life Map';
	}

	getIcon(): string {
		return 'map';
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('life-map-view');

		this.bannerEl = root.createDiv({ cls: 'life-map-banner is-hidden' });
		this.bannerEl.createSpan({ text: '未配置天地图 tk，当前使用备用底图。' });
		const settingsLink = this.bannerEl.createEl('a', { text: '去设置', href: '#' });
		settingsLink.addEventListener('click', (event) => {
			event.preventDefault();
			this.openSettings();
		});

		const body = root.createDiv({ cls: 'life-map-body' });
		const main = body.createDiv({ cls: 'life-map-main' });

		const toolbar = main.createDiv({ cls: 'life-map-toolbar' });
		this.buildSearch(toolbar);
		this.buildTimeFilter(toolbar);
		this.buildNewPlaceButton(toolbar);
		this.buildRefreshButton(toolbar);

		this.chipsEl = main.createDiv({ cls: 'life-map-chips' });
		this.filterBarEl = main.createDiv({ cls: 'life-map-extra-filters' });
		this.statusEl = main.createDiv({ cls: 'life-map-status' });

		const canvasWrap = main.createDiv({ cls: 'life-map-canvas-wrap' });
		this.mapEl = canvasWrap.createDiv({ cls: 'life-map-canvas' });
		this.emptyEl = canvasWrap.createDiv({ cls: 'life-map-empty' });
		this.emptyEl.setText('正在加载数据…');

		// Re-style the basemap when the user switches light/dark theme.
		this.registerEvent(this.app.workspace.on('css-change', () => this.render()));

		const settings = this.plugin.settings;
		this.sidebar = new Sidebar(body, {
			tab: settings.sidebarTab,
			open: settings.sidebarOpen,
			onSelect: (index) => this.selectFeature(index),
			onTabChange: (tab) => {
				settings.sidebarTab = tab;
				void this.plugin.saveUiState();
			},
			onToggle: (open) => {
				settings.sidebarOpen = open;
				this.updateReopenVisibility();
				void this.plugin.saveUiState();
			},
		});

		this.reopenButton = canvasWrap.createEl('button', {
			cls: 'life-map-reopen is-hidden',
			attr: { 'aria-label': '展开面板' },
		});
		setIcon(this.reopenButton, 'panel-right-open');
		this.reopenButton.addEventListener('click', () => this.sidebar.setOpen(true));
		this.updateReopenVisibility();

		await this.plugin.refreshFeatures();
		this.initMap();
		this.render();

		const pending = this.plugin.pendingIntent;
		if (pending) {
			this.plugin.pendingIntent = null;
			this.applyIntent(pending);
		}
	}

	async onClose(): Promise<void> {
		if (this.repaintTimer !== null) window.clearTimeout(this.repaintTimer);
		this.repaintTimer = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.popup?.remove();
		this.popup = null;
		this.closeLightbox();
		this.map?.remove();
		this.map = null;
	}

	/** Called by the plugin after every data refresh. */
	render(): void {
		this.renderChips();
		this.updateStatus();
		this.updateBanner();

		if (!this.map) this.initMap();
		if (!this.map) return;

		const signature = this.computeStyleSignature();
		if (signature !== this.styleSignature) {
			this.styleSignature = signature;
			const basemap = resolveBasemap(this.plugin.settings, this.plugin.registry.getBasemaps());
			if (basemap) {
				this.map.setStyle(basemap.getStyle(this.plugin.settings, this.useDark()) as StyleSpecification);
				const paintWhenReady = (attempt: number): void => {
					if (!this.map) return;
					if (this.map.isStyleLoaded() || attempt > 20) this.repaint();
					else window.setTimeout(() => paintWhenReady(attempt + 1), 100);
				};
				window.setTimeout(() => paintWhenReady(0), 100);
				return;
			}
		}

		this.repaint();
	}

	private updateBanner(): void {
		if (!this.bannerEl) return;
		const settings = this.plugin.settings;
		const needsKey = settings.basemapId === 'tianditu' && !settings.tiandituKey.trim();
		this.bannerEl.toggleClass('is-hidden', !needsKey);
	}

	private openSettings(): void {
		const app = this.app as unknown as {
			setting?: { open(): void; openTabById(id: string): void };
		};
		app.setting?.open();
		app.setting?.openTabById(this.plugin.manifest.id);
	}

	private buildSearch(parent: HTMLElement): void {
		const wrap = parent.createDiv({ cls: 'life-map-search' });
		setIcon(wrap.createSpan({ cls: 'life-map-search-icon' }), 'search');
		this.searchInput = wrap.createEl('input', {
			type: 'text',
			placeholder: '搜索地点、标签、属性',
			cls: 'life-map-search-input',
		});
		this.searchInput.addEventListener('input', () => {
			this.search = this.searchInput.value.trim();
			this.scheduleRepaint();
		});
	}

	private buildTimeFilter(parent: HTMLElement): void {
		const wrap = parent.createDiv({ cls: 'life-map-dates' });
		wrap.createSpan({ cls: 'life-map-date-label', text: '时间' });
		this.fromInput = wrap.createEl('input', { type: 'date', cls: 'life-map-date' });
		wrap.createSpan({ cls: 'life-map-date-sep', text: '→' });
		this.toInput = wrap.createEl('input', { type: 'date', cls: 'life-map-date' });
		this.fromInput.addEventListener('change', () => {
			this.from = this.fromInput.value;
			this.scheduleRepaint();
		});
		this.toInput.addEventListener('change', () => {
			this.to = this.toInput.value;
			this.scheduleRepaint();
		});
	}

	private buildNewPlaceButton(parent: HTMLElement): void {
		const button = parent.createEl('button', {
			cls: 'life-map-icon-button',
			attr: { 'aria-label': '新建地点笔记' },
		});
		setIcon(button, 'plus');
		button.addEventListener('click', () => this.plugin.openNewPlaceModal());
	}

	private buildRefreshButton(parent: HTMLElement): void {
		const button = parent.createEl('button', {
			cls: 'life-map-icon-button',
			attr: { 'aria-label': '刷新数据' },
		});
		setIcon(button, 'refresh-cw');
		button.addEventListener('click', () => {
			void this.plugin.refreshFeatures().then(() => this.render());
		});
	}

	private initMap(): void {
		if (this.map) return;
		const settings = this.plugin.settings;
		const basemap = resolveBasemap(settings, this.plugin.registry.getBasemaps());
		if (!basemap) {
			this.showFatal('没有可用的底图，请在设置里选择一个。');
			return;
		}

		this.map = new maplibregl.Map({
			container: this.mapEl,
			style: basemap.getStyle(settings, this.useDark()) as StyleSpecification,
			center: [104.2, 35.86],
			zoom: 3.1,
			maxZoom: 18,
			attributionControl: false,
		});
		this.styleSignature = this.computeStyleSignature();

		this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
		this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-left');
		if (settings.showAttribution) {
			this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
		}

		this.map.on('load', () => this.repaint());
		this.map.on('error', (event) => {
			console.warn('[life-map] map error', event?.error ?? event);
		});

		this.resizeObserver = new ResizeObserver(() => this.map?.resize());
		this.resizeObserver.observe(this.mapEl);
	}

	private computeStyleSignature(): string {
		const settings = this.plugin.settings;
		const basemap = resolveBasemap(settings, this.plugin.registry.getBasemaps());
		return [
			basemap?.id ?? '',
			this.useDark() ? 'dark' : 'light',
			settings.tiandituKey,
			settings.customXyzUrl,
			settings.customXyzAttribution,
			settings.customXyzCoordSys,
		].join('|');
	}

	private isDarkTheme(): boolean {
		return document.body.classList.contains('theme-dark');
	}

	/** Should the basemap be rendered in its dark variant? */
	private useDark(): boolean {
		return this.plugin.settings.followTheme && this.isDarkTheme();
	}

	private scheduleRepaint(): void {
		if (this.repaintTimer !== null) window.clearTimeout(this.repaintTimer);
		this.repaintTimer = window.setTimeout(() => {
			this.repaintTimer = null;
			this.repaint();
		}, 150);
	}

	private repaint(): void {
		const map = this.map;
		if (!map || !map.isStyleLoaded()) return;

		const settings = this.plugin.settings;
		const basemap = resolveBasemap(settings, this.plugin.registry.getBasemaps());
		const targetSys = basemap ? basemapCoordSys(basemap, settings.customXyzCoordSys) : 'WGS84';

		this.colorBySource = new Map<string, string>();
		for (const result of this.plugin.results) this.colorBySource.set(result.sourceId, result.color);

		const visible: Feature[] = [];
		for (const result of this.plugin.results) {
			if (this.hiddenSources.has(result.sourceId)) continue;
			for (const feature of result.features) {
				if (this.matches(feature)) visible.push(feature);
			}
		}

		// One marker per place; every note at that place becomes a sub-record.
		this.places = groupPlaces(visible, this.colorBySource);
		this.placeLngLat = [];
		const features: Record<string, unknown>[] = this.places.map((place, index) => {
			const [lat, lng] = fromWGS84(place.lat, place.lng, targetSys);
			this.placeLngLat.push([lng, lat]);
			return {
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [lng, lat] },
				properties: {
					place: index,
					count: place.visits.length,
					color: place.color ?? POINT_DEFAULT_COLOR,
					hasPhotos: place.photos.length > 0,
				},
			};
		});

		const data = { type: 'FeatureCollection', features };
		const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
		if (source) {
			source.setData(data as never);
		} else {
			this.addLayers(data);
		}

		this.updateEmpty(this.places.length);
		this.updateStatus();
		this.refreshSidebar();
	}

	private addLayers(data: unknown): void {
		const map = this.map;
		if (!map) return;
		const settings = this.plugin.settings;

		map.addSource(SOURCE_ID, {
			type: 'geojson',
			data: data as never,
			cluster: true,
			clusterRadius: settings.clusterRadius,
			clusterMaxZoom: settings.clusterMaxZoom,
		});

		map.addLayer({
			id: LAYER_CLUSTERS,
			type: 'circle',
			source: SOURCE_ID,
			filter: ['has', 'point_count'],
			paint: {
				'circle-color': CLUSTER_COLOR,
				'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 50, 26],
				'circle-stroke-width': 2,
				'circle-stroke-color': '#ffffff',
				'circle-opacity': 0.92,
			},
		});

		map.addLayer({
			id: LAYER_POINTS,
			type: 'circle',
			source: SOURCE_ID,
			filter: ['!', ['has', 'point_count']],
			paint: {
				'circle-color': ['get', 'color'],
				'circle-radius': ['case', ['get', 'hasPhotos'], 7.5, 5.5],
				'circle-stroke-width': 2,
				'circle-stroke-color': '#ffffff',
				'circle-opacity': 0.95,
			},
		});

		this.bindInteractions();
	}

	private bindInteractions(): void {
		const map = this.map;
		if (!map || this.interactionsBound) return;
		this.interactionsBound = true;

		map.on('click', LAYER_CLUSTERS, (event: MapLayerMouseEvent) => {
			const feature = event.features?.[0];
			if (!feature || feature.geometry.type !== 'Point') return;
			const coords = feature.geometry.coordinates as [number, number];
			map.easeTo({ center: coords, zoom: Math.min(map.getZoom() + 2, 16) });
		});

		map.on('click', LAYER_POINTS, (event: MapLayerMouseEvent) => {
			const feature = event.features?.[0];
			if (!feature || feature.geometry.type !== 'Point') return;
			const index = Number(feature.properties?.place);
			if (!Number.isFinite(index)) return;
			this.showPlacePopup(index, feature.geometry.coordinates as [number, number]);
		});

		map.on('mouseenter', LAYER_POINTS, () => {
			map.getCanvas().style.cursor = 'pointer';
		});
		map.on('mouseleave', LAYER_POINTS, () => {
			map.getCanvas().style.cursor = '';
		});
		map.on('mouseenter', LAYER_CLUSTERS, () => {
			map.getCanvas().style.cursor = 'pointer';
		});
		map.on('mouseleave', LAYER_CLUSTERS, () => {
			map.getCanvas().style.cursor = '';
		});
	}

	/** Popup for a place: header plus every visit as a sub-record. */
	private showPlacePopup(index: number, lngLat: [number, number]): void {
		const place = this.places[index];
		const map = this.map;
		if (!place || !map) return;

		this.popup?.remove();

		const content = document.createElement('div');
		content.addClass('life-map-popup');
		content.createDiv({ cls: 'life-map-popup-title', text: place.name });

		const meta: string[] = [];
		if (place.visits.length > 1) meta.push(`${place.visits.length} 次到访`);
		if (place.latest) meta.push(this.formatTime(place.latest));
		if (place.category) meta.push(place.category);
		for (const tag of place.tags.slice(0, 3)) meta.push(`#${tag}`);
		if (meta.length > 0) {
			content.createDiv({ cls: 'life-map-popup-meta', text: meta.join(' · ') });
		}

		const address = place.visits[0]?.props['address'];
		if (typeof address === 'string' && address.trim()) {
			content.createDiv({ cls: 'life-map-popup-address', text: address.trim() });
		}

		const list = content.createDiv({ cls: 'life-map-visits' });
		const shown = place.visits.slice(0, 5);
		shown.forEach((visit, position) => {
			list.appendChild(this.buildVisitEntry(visit, place, position > 0));
		});
		if (place.visits.length > shown.length) {
			content.createDiv({
				cls: 'life-map-popup-more',
				text: `还有 ${place.visits.length - shown.length} 次到访`,
			});
		}

		this.activeIndex = index;
		this.refreshSidebar();

		const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '340px', offset: 14 })
			.setLngLat(lngLat)
			.setDOMContent(content)
			.addTo(map);
		popup.on('close', () => {
			if (this.popup !== popup) return;
			this.popup = null;
			this.activeIndex = null;
			this.refreshSidebar();
		});
		this.popup = popup;
	}

	private buildVisitEntry(visit: Feature, place: PlaceGroup, separated: boolean): HTMLElement {
		const root = document.createElement('div');
		root.addClass('life-map-visit');
		if (separated) root.addClass('is-separated');

		const head = root.createDiv({ cls: 'life-map-visit-head' });
		head.createSpan({
			cls: 'life-map-visit-date',
			text: visit.time ? this.formatTime(visit.time) : '未记录时间',
		});
		if (visit.name && visit.name !== place.name) {
			head.createSpan({ cls: 'life-map-visit-name', text: visit.name });
		}
		if (visit.link) {
			const actions = head.createDiv({ cls: 'life-map-visit-actions' });
			const open = actions.createEl('button', { cls: 'life-map-popup-button', text: '打开' });
			open.addEventListener('click', () => this.openLink(visit.link as string));

			// Only vault notes can be deleted; file/API sources are read-only.
			const file = this.app.vault.getAbstractFileByPath(visit.link);
			if (file instanceof TFile) {
				const remove = actions.createEl('button', {
					cls: 'life-map-popup-button is-danger',
					text: '删除',
				});
				remove.addEventListener('click', (event) => {
					event.stopPropagation();
					this.confirmDeleteVisit(visit, file);
				});
			}
		}

		if (visit.photos.length > 0) {
			const grid = root.createDiv({
				cls: visit.photos.length === 1 ? 'life-map-popup-photos is-single' : 'life-map-popup-photos',
			});
			visit.photos.slice(0, 3).forEach((photo, photoIndex) => {
				const img = grid.createEl('img', {
					cls: 'life-map-popup-photo',
					attr: { src: photo.url, loading: 'lazy', alt: photo.caption ?? place.name },
				});
				img.addEventListener('click', () => this.openLightbox(visit.photos, photoIndex));
			});
		}

		return root;
	}

	private confirmDeleteVisit(visit: Feature, file: TFile): void {
		new ConfirmDeleteModal(this.app, {
			title: `删除「${visit.name ?? file.basename}」？`,
			message: '这条笔记会移入回收站（不是永久删除），可以在回收站里恢复。只影响这一条记录。',
			confirmLabel: '移入回收站',
			onConfirm: async () => {
				try {
					await this.app.fileManager.trashFile(file);
					new Notice(`已删除 ${file.path}`);
					this.popup?.remove();
					await this.plugin.refreshFeatures();
				} catch (error) {
					console.error('[life-map] delete failed', error);
					new Notice('删除失败，请查看控制台');
				}
			},
		}).open();
	}

	private openLink(link: string): void {
		if (/^https?:\/\//i.test(link)) {
			window.open(link, '_blank');
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(link);
		if (file instanceof TFile) {
			void this.app.workspace.getLeaf(true).openFile(file);
			return;
		}
		void this.app.workspace.openLinkText(link, '', true);
	}

	private formatTime(value: string): string {
		const date = new Date(value);
		if (isNaN(date.getTime())) return value;
		return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	/** Cached lowercase search text per feature; features are replaced on refresh. */
	private searchHaystack(feature: Feature): string {
		let cached = this.haystackCache.get(feature);
		if (cached === undefined) {
			cached = [
				feature.name ?? '',
				feature.category ?? '',
				...feature.tags,
				JSON.stringify(feature.props).slice(0, 500),
			]
				.join(' ')
				.toLowerCase();
			this.haystackCache.set(feature, cached);
		}
		return cached;
	}

	private matches(feature: Feature): boolean {
		if (this.search) {
			if (!this.searchHaystack(feature).includes(this.search.toLowerCase())) return false;
		}

		if (this.tagFilter && !feature.tags.includes(this.tagFilter)) return false;

		if (this.bboxFilter) {
			const [minLng, minLat, maxLng, maxLat] = this.bboxFilter;
			if (feature.lng < minLng || feature.lng > maxLng) return false;
			if (feature.lat < minLat || feature.lat > maxLat) return false;
		}

		if (this.from || this.to) {
			const time = feature.time ? Date.parse(feature.time) : NaN;
			if (!Number.isFinite(time)) return false;
			if (this.from && time < Date.parse(this.from)) return false;
			if (this.to && time > Date.parse(this.to) + 86_399_999) return false;
		}

		return true;
	}

	/** Features currently rendered (already filtered by search / time / layer toggles). */
	getVisibleFeatures(): Feature[] {
		return this.places.flatMap((place) => place.visits);
	}

	private openLightbox(photos: PhotoRef[], index: number): void {
		this.closeLightbox();
		if (photos.length === 0) return;
		this.lightboxPhotos = photos;
		this.lightboxIndex = Math.max(0, Math.min(index, photos.length - 1));

		const root = this.contentEl.createDiv({ cls: 'life-map-lightbox' });
		this.lightboxEl = root;
		root.addEventListener('click', (event) => {
			if (event.target === root) this.closeLightbox();
		});

		const close = root.createEl('button', {
			cls: 'life-map-lightbox-close',
			attr: { 'aria-label': '关闭' },
		});
		setIcon(close, 'x');
		close.addEventListener('click', () => this.closeLightbox());

		if (photos.length > 1) {
			const prev = root.createEl('button', {
				cls: 'life-map-lightbox-nav is-prev',
				attr: { 'aria-label': '上一张' },
			});
			setIcon(prev, 'chevron-left');
			prev.addEventListener('click', (event) => {
				event.stopPropagation();
				this.stepLightbox(-1);
			});

			const next = root.createEl('button', {
				cls: 'life-map-lightbox-nav is-next',
				attr: { 'aria-label': '下一张' },
			});
			setIcon(next, 'chevron-right');
			next.addEventListener('click', (event) => {
				event.stopPropagation();
				this.stepLightbox(1);
			});

			this.lightboxCounter = root.createDiv({ cls: 'life-map-lightbox-counter' });
		}

		this.lightboxImage = root.createEl('img', { cls: 'life-map-lightbox-image' });
		this.lightboxCaption = root.createDiv({ cls: 'life-map-lightbox-caption' });

		this.lightboxKeyHandler = (event: KeyboardEvent) => {
			if (event.key === 'Escape') this.closeLightbox();
			else if (event.key === 'ArrowLeft') this.stepLightbox(-1);
			else if (event.key === 'ArrowRight') this.stepLightbox(1);
		};
		document.addEventListener('keydown', this.lightboxKeyHandler);

		this.renderLightbox();
	}

	private stepLightbox(delta: number): void {
		if (this.lightboxPhotos.length <= 1) return;
		const length = this.lightboxPhotos.length;
		this.lightboxIndex = (this.lightboxIndex + delta + length) % length;
		this.renderLightbox();
	}

	private renderLightbox(): void {
		const photo = this.lightboxPhotos[this.lightboxIndex];
		if (!photo) return;
		if (this.lightboxImage) {
			this.lightboxImage.src = photo.url;
			this.lightboxImage.alt = photo.caption ?? '';
		}
		if (this.lightboxCaption) {
			this.lightboxCaption.setText(photo.caption ?? '');
			this.lightboxCaption.toggleClass('is-hidden', !photo.caption);
		}
		if (this.lightboxCounter) {
			this.lightboxCounter.setText(`${this.lightboxIndex + 1} / ${this.lightboxPhotos.length}`);
		}
	}

	private closeLightbox(): void {
		if (this.lightboxKeyHandler) {
			document.removeEventListener('keydown', this.lightboxKeyHandler);
			this.lightboxKeyHandler = null;
		}
		this.lightboxEl?.remove();
		this.lightboxEl = null;
		this.lightboxImage = null;
		this.lightboxCaption = null;
		this.lightboxCounter = null;
		this.lightboxPhotos = [];
	}

	/** Apply a filter/zoom context handed over by an inline map. */
	applyIntent(intent: MapViewIntent): void {
		this.tagFilter = intent.tag ?? null;
		this.bboxFilter = intent.bbox ?? null;
		this.renderExtraFilters();

		if (this.map && intent.center) {
			const settings = this.plugin.settings;
			const basemap = resolveBasemap(settings, this.plugin.registry.getBasemaps());
			const targetSys = basemap ? basemapCoordSys(basemap, settings.customXyzCoordSys) : 'WGS84';
			const [lat, lng] = fromWGS84(intent.center[0], intent.center[1], targetSys);
			this.map.jumpTo({
				center: [lng, lat],
				zoom: intent.zoom ?? this.map.getZoom(),
			});
		}

		this.repaint();
	}

	private renderExtraFilters(): void {
		if (!this.filterBarEl) return;
		this.filterBarEl.empty();

		if (this.tagFilter) {
			const chip = this.filterBarEl.createEl('button', { cls: 'life-map-extra-filter' });
			chip.createSpan({ text: `标签：${this.tagFilter}` });
			const remove = chip.createSpan({ cls: 'life-map-extra-filter-close', text: '×' });
			remove.addEventListener('click', (event) => {
				event.stopPropagation();
				this.tagFilter = null;
				this.renderExtraFilters();
				this.repaint();
			});
		}

		if (this.bboxFilter) {
			const chip = this.filterBarEl.createEl('button', { cls: 'life-map-extra-filter' });
			chip.createSpan({ text: '范围：来自内嵌地图的视野' });
			const remove = chip.createSpan({ cls: 'life-map-extra-filter-close', text: '×' });
			remove.addEventListener('click', (event) => {
				event.stopPropagation();
				this.bboxFilter = null;
				this.renderExtraFilters();
				this.repaint();
			});
		}
	}

	private clearExtraFilters(): void {
		this.tagFilter = null;
		this.bboxFilter = null;
		this.renderExtraFilters();
	}

	private selectFeature(index: number): void {
		const place = this.places[index];
		const map = this.map;
		const lngLat = this.placeLngLat[index];
		if (!place || !map || !lngLat) return;
		this.activeIndex = index;
		map.easeTo({
			center: lngLat,
			zoom: Math.max(map.getZoom(), 13),
			duration: 600,
		});
		this.showPlacePopup(index, lngLat);
		this.refreshSidebar();
		if (!this.plugin.settings.sidebarOpen) this.sidebar.setOpen(true);
	}

	private refreshSidebar(): void {
		if (!this.sidebar) return;
		const items = this.places.map((place, index) => ({
			place,
			index,
			color: place.color ?? POINT_DEFAULT_COLOR,
		}));
		this.sidebar.render(items, this.activeIndex);
	}

	private updateReopenVisibility(): void {
		if (!this.reopenButton) return;
		this.reopenButton.toggleClass('is-hidden', this.plugin.settings.sidebarOpen);
	}

	private renderChips(): void {
		if (!this.chipsEl) return;
		this.chipsEl.empty();
		for (const result of this.plugin.results) {
			const chip = this.chipsEl.createEl('button', { cls: 'life-map-chip' });
			const dot = chip.createSpan({ cls: 'life-map-chip-dot' });
			dot.style.backgroundColor = result.color;
			chip.createSpan({ text: `${result.name} ${result.features.length}` });
			if (result.error) {
				chip.addClass('is-error');
				chip.setAttr('title', result.error);
			}
			if (this.hiddenSources.has(result.sourceId)) chip.addClass('is-off');
			chip.addEventListener('click', () => {
				if (this.hiddenSources.has(result.sourceId)) this.hiddenSources.delete(result.sourceId);
				else this.hiddenSources.add(result.sourceId);
				this.renderChips();
				this.repaint();
			});
		}
	}

	private updateStatus(): void {
		if (!this.statusEl) return;
		const results = this.plugin.results;
		const visitCount = this.places.reduce((sum, place) => sum + place.visits.length, 0);
		const errors = results.filter((result) => result.error);
		const parts = [`${this.places.length} 个地点`, `${visitCount} 条记录`, `${results.length} 个数据源`];
		if (errors.length > 0) parts.push(`${errors.length} 个源出错`);
		this.statusEl.setText(parts.join(' · '));
		this.statusEl.toggleClass('is-error', errors.length > 0);
		if (errors.length > 0) {
			this.statusEl.setAttr(
				'title',
				errors.map((error) => `${error.name}: ${error.error}`).join('\n')
			);
		} else {
			this.statusEl.removeAttribute('title');
		}
	}

	private totalFeatureCount(): number {
		return this.plugin.results.reduce((sum, result) => sum + result.features.length, 0);
	}

	private updateEmpty(visibleCount: number): void {
		if (!this.emptyEl) return;
		if (visibleCount > 0) {
			this.emptyEl.toggleClass('is-hidden', true);
			return;
		}
		this.emptyEl.toggleClass('is-hidden', false);
		this.emptyEl.empty();
		const card = this.emptyEl.createDiv({ cls: 'life-map-empty-card' });
		if (this.totalFeatureCount() === 0) this.renderOnboarding(card);
		else this.renderNoResults(card);
	}

	/** Nothing loaded yet: teach the user the three ways to get data in. */
	private renderOnboarding(card: HTMLElement): void {
		card.createDiv({ cls: 'life-map-empty-title', text: '还没有可显示的地点' });

		const steps = card.createEl('ol', { cls: 'life-map-empty-steps' });
		steps.createEl('li', { text: '给笔记加上 coordinates 属性（最常用）' });
		steps.createEl('li', { text: '把 .geojson 或 .csv 文件放进 vault' });
		steps.createEl('li', { text: '在设置里接入任意 JSON API' });

		card.createEl('pre', { cls: 'life-map-empty-code', text: EXAMPLE_FRONTMATTER });

		const actions = card.createDiv({ cls: 'life-map-empty-actions' });
		const copy = actions.createEl('button', { cls: 'life-map-empty-button', text: '复制示例' });
		copy.addEventListener('click', () => {
			void navigator.clipboard
				?.writeText(EXAMPLE_FRONTMATTER)
				.then(() => new Notice('已复制示例 frontmatter'))
				.catch(() => new Notice('复制失败，请手动选择'));
		});
		const openSettingsButton = actions.createEl('button', {
			cls: 'life-map-empty-button is-cta',
			text: '打开设置',
		});
		openSettingsButton.addEventListener('click', () => this.openSettings());
	}

	/** Data exists but the current filters hide everything. */
	private renderNoResults(card: HTMLElement): void {
		card.createDiv({ cls: 'life-map-empty-title', text: '没有符合筛选的地点' });
		card.createDiv({
			cls: 'life-map-empty-desc',
			text: '试试清空搜索关键词、时间范围，或打开被隐藏的数据源。',
		});
		const actions = card.createDiv({ cls: 'life-map-empty-actions' });
		const reset = actions.createEl('button', { cls: 'life-map-empty-button is-cta', text: '清空筛选' });
		reset.addEventListener('click', () => {
			this.search = '';
			this.from = '';
			this.to = '';
			if (this.searchInput) this.searchInput.value = '';
			if (this.fromInput) this.fromInput.value = '';
			if (this.toInput) this.toInput.value = '';
			this.hiddenSources.clear();
			this.clearExtraFilters();
			this.renderChips();
			this.repaint();
		});
	}

	/** Unrecoverable setup problem (e.g. no basemap registered). */
	private showFatal(message: string): void {
		if (!this.emptyEl) return;
		this.emptyEl.toggleClass('is-hidden', false);
		this.emptyEl.empty();
		const card = this.emptyEl.createDiv({ cls: 'life-map-empty-card' });
		card.createDiv({ cls: 'life-map-empty-title', text: message });
		const actions = card.createDiv({ cls: 'life-map-empty-actions' });
		const openSettingsButton = actions.createEl('button', {
			cls: 'life-map-empty-button is-cta',
			text: '打开设置',
		});
		openSettingsButton.addEventListener('click', () => this.openSettings());
	}
}
