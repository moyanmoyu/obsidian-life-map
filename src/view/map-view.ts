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
import type LifeMapPlugin from '../main';
import { Sidebar } from './sidebar';

interface RenderPoint {
	feature: Feature;
	lngLat: [number, number];
}

export class LifeMapView extends ItemView {
	private readonly plugin: LifeMapPlugin;

	private map: MapLibreMap | null = null;
	private mapEl!: HTMLElement;
	private sidebar!: Sidebar;
	private reopenButton!: HTMLElement;
	private bannerEl!: HTMLElement;
	private chipsEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private emptyEl!: HTMLElement;
	private searchInput!: HTMLInputElement;
	private fromInput!: HTMLInputElement;
	private toInput!: HTMLInputElement;

	private points: RenderPoint[] = [];
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
		this.buildRefreshButton(toolbar);

		this.chipsEl = main.createDiv({ cls: 'life-map-chips' });
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

		this.points = [];
		const features: Record<string, unknown>[] = [];

		for (const result of this.plugin.results) {
			if (this.hiddenSources.has(result.sourceId)) continue;
			for (const feature of result.features) {
				if (!this.matches(feature)) continue;
				const [lat, lng] = fromWGS84(feature.lat, feature.lng, targetSys);
				const index = this.points.length;
				this.points.push({ feature, lngLat: [lng, lat] });
				features.push({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: [lng, lat] },
					properties: {
						index,
						color: this.colorBySource.get(feature.sourceId) ?? POINT_DEFAULT_COLOR,
						hasPhotos: feature.photos.length > 0,
					},
				});
			}
		}

		const data = { type: 'FeatureCollection', features };
		const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
		if (source) {
			source.setData(data as never);
		} else {
			this.addLayers(data);
		}

		this.updateEmpty(features.length);
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
			const index = Number(feature.properties?.index);
			if (!Number.isFinite(index)) return;
			this.showPopup(index, feature.geometry.coordinates as [number, number]);
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

	private showPopup(index: number, lngLat: [number, number]): void {
		const point = this.points[index];
		const map = this.map;
		if (!point || !map) return;

		this.popup?.remove();
		const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '320px', offset: 14 })
			.setLngLat(lngLat)
			.setDOMContent(this.buildPopupContent(point.feature))
			.addTo(map);
		popup.on('close', () => {
			if (this.popup !== popup) return;
			this.popup = null;
			this.activeIndex = null;
			this.refreshSidebar();
		});
		this.popup = popup;
	}

	private buildPopupContent(feature: Feature): HTMLElement {
		const root = document.createElement('div');
		root.addClass('life-map-popup');

		root.createDiv({ cls: 'life-map-popup-title', text: feature.name ?? '未命名地点' });

		const meta: string[] = [];
		if (feature.time) meta.push(this.formatTime(feature.time));
		if (feature.category) meta.push(feature.category);
		for (const tag of feature.tags.slice(0, 4)) meta.push(`#${tag}`);
		if (meta.length > 0) {
			root.createDiv({ cls: 'life-map-popup-meta', text: meta.join(' · ') });
		}

		const address = feature.props['address'];
		if (typeof address === 'string' && address.trim()) {
			root.createDiv({ cls: 'life-map-popup-address', text: address.trim() });
		}

		if (feature.photos.length > 0) {
			const grid = root.createDiv({
				cls: feature.photos.length === 1 ? 'life-map-popup-photos is-single' : 'life-map-popup-photos',
			});
			feature.photos.slice(0, 4).forEach((photo, index) => {
				const img = grid.createEl('img', {
					cls: 'life-map-popup-photo',
					attr: { src: photo.url, loading: 'lazy', alt: photo.caption ?? feature.name ?? '' },
				});
				img.addEventListener('click', () => this.openLightbox(feature.photos, index));
			});
		}

		if (feature.link) {
			const actions = root.createDiv({ cls: 'life-map-popup-actions' });
			const button = actions.createEl('button', {
				cls: 'life-map-popup-button',
				text: '打开',
			});
			button.addEventListener('click', () => this.openLink(feature.link as string));
		}

		return root;
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
		return this.points.map((point) => point.feature);
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

	private selectFeature(index: number): void {
		const point = this.points[index];
		const map = this.map;
		if (!point || !map) return;
		this.activeIndex = index;
		map.easeTo({
			center: point.lngLat,
			zoom: Math.max(map.getZoom(), 12),
			duration: 600,
		});
		this.showPopup(index, point.lngLat);
		this.refreshSidebar();
		if (!this.plugin.settings.sidebarOpen) this.sidebar.setOpen(true);
	}

	private refreshSidebar(): void {
		if (!this.sidebar) return;
		const items = this.points.map((point, index) => ({
			feature: point.feature,
			index,
			color: this.colorBySource.get(point.feature.sourceId) ?? POINT_DEFAULT_COLOR,
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
		const total = results.reduce((sum, result) => sum + result.features.length, 0);
		const errors = results.filter((result) => result.error);
		const parts = [`${total} 个地点`, `${results.length} 个数据源`];
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
