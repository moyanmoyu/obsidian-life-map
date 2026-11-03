import { Notice, Plugin, type WorkspaceLeaf } from 'obsidian';
import { LifeMapApiImpl, type LifeMapApi } from './api';
import { BUILTIN_BASEMAPS } from './basemaps';
import { VIEW_TYPE_LIFE_MAP } from './constants';
import type { Feature } from './core/model';
import { Registry } from './core/registry';
import type { LoadResult } from './core/source';
import { FeatureService } from './service';
import { buildPlaceNoteContent, sanitizeFileName, type PlaceNoteValues } from './place-template';
import { DEFAULT_SETTINGS, type LifeMapSettings } from './settings';
import { LifeMapSettingsTab } from './settings-tab';
import { NewPlaceModal } from './ui/new-place-modal';
import { CsvSource } from './sources/csv';
import { GeoJsonSource } from './sources/geojson';
import { VaultFrontmatterSource } from './sources/vault-frontmatter';
import { renderInlineMap } from './view/inline-map';
import { LifeMapView } from './view/map-view';

/**
 * Context handed from an inline map (or any future entry point) to the full
 * map view. Coordinates are WGS-84.
 */
export interface MapViewIntent {
	center?: [number, number];
	zoom?: number;
	/** Only show features carrying this tag */
	tag?: string;
	/** Only show features inside this WGS-84 bbox: [minLng, minLat, maxLng, maxLat] */
	bbox?: [number, number, number, number];
}

export default class LifeMapPlugin extends Plugin {
	settings!: LifeMapSettings;
	registry = new Registry();
	service!: FeatureService;
	results: LoadResult[] = [];
	api!: LifeMapApi;
	/** Number of ```life-map``` blocks currently holding a WebGL context. */
	inlineMapCount = 0;
	/** Intent consumed by the view when it is created. */
	pendingIntent: MapViewIntent | null = null;

	private refreshSequence = 0;
	private autoRefreshTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Built-in data sources
		this.registry.registerSource(new VaultFrontmatterSource());
		this.registry.registerSource(new GeoJsonSource());
		this.registry.registerSource(new CsvSource());

		// Built-in basemaps (天地图 first: it is the default)
		for (const basemap of BUILTIN_BASEMAPS) this.registry.registerBasemap(basemap);

		this.service = new FeatureService(this.app, this.registry, () => this.settings);
		this.api = new LifeMapApiImpl(this);
		(window as unknown as { lifeMapApi?: LifeMapApi }).lifeMapApi = this.api;

		this.registerView(VIEW_TYPE_LIFE_MAP, (leaf: WorkspaceLeaf) => new LifeMapView(leaf, this));

		this.addRibbonIcon('map', '打开 Life Map', () => {
			void this.activateView();
		});

		this.addCommand({
			id: 'open-map',
			name: '打开地图视图',
			callback: () => {
				void this.activateView();
			},
		});
		this.addCommand({
			id: 'refresh-map',
			name: '刷新地图数据',
			callback: () => {
				void this.refreshFeatures();
			},
		});

		this.addCommand({
			id: 'new-place-note',
			name: '新建地点笔记',
			callback: () => this.openNewPlaceModal(),
		});
		this.addCommand({
			id: 'export-geojson',
			name: '导出当前视图为 GeoJSON',
			callback: () => {
				void this.exportGeoJson();
			},
		});
		this.addCommand({
			id: 'export-markdown',
			name: '导出当前视图为 Markdown 清单',
			callback: () => {
				void this.exportMarkdown();
			},
		});

		this.registerMarkdownCodeBlockProcessor('life-map', (source, el, ctx) => {
			return renderInlineMap(this, source, el, ctx);
		});

		this.addSettingTab(new LifeMapSettingsTab(this.app, this));

		// Keep the map in sync with the vault, but only while a map view is open.
		this.registerEvent(this.app.metadataCache.on('changed', () => this.scheduleAutoRefresh()));

		// Warm the cache so the first open is fast.
		void this.refreshFeatures();
	}

	onunload(): void {
		if (this.autoRefreshTimer !== null) window.clearTimeout(this.autoRefreshTimer);
		this.autoRefreshTimer = null;
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_LIFE_MAP);
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<LifeMapSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...data,
			vault: { ...DEFAULT_SETTINGS.vault, ...(data?.vault ?? {}) },
			httpSources: data?.httpSources ?? [],
			enabledSources: data?.enabledSources ?? DEFAULT_SETTINGS.enabledSources,
		};

		// Migration: the first 高德 preset used `webrd` (road-only tiles, no POI
		// labels). `wprd` is the full basemap with building/POI labels.
		if (this.settings.customXyzUrl.includes('webrd')) {
			this.settings.customXyzUrl = this.settings.customXyzUrl.replace(/webrd/g, 'wprd');
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.scheduleAutoRefresh(200);
	}

	/** Persist UI-only state (panel open/tab) without re-loading data. */
	async saveUiState(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Reload every enabled source. Concurrent calls resolve to the latest one. */
	async refreshFeatures(): Promise<LoadResult[]> {
		const sequence = ++this.refreshSequence;
		const results = await this.service.loadAll();
		if (sequence === this.refreshSequence) {
			this.results = results;
			this.refreshViews();
		}
		return results;
	}

	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LIFE_MAP)) {
			const view = leaf.view;
			if (view instanceof LifeMapView) view.render();
		}
	}

	async activateView(intent?: MapViewIntent): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_LIFE_MAP);
		if (existing.length > 0) {
			const view = existing[0].view;
			if (intent && view instanceof LifeMapView) view.applyIntent(intent);
			workspace.revealLeaf(existing[0]);
			return;
		}
		if (intent) this.pendingIntent = intent;
		const leaf = workspace.getLeaf(true);
		await leaf.setViewState({ type: VIEW_TYPE_LIFE_MAP, active: true });
		workspace.revealLeaf(leaf);
	}

	openNewPlaceModal(): void {
		new NewPlaceModal(this.app, this.settings, (values) => {
			void this.createPlaceNote(values);
		}).open();
	}

	async createPlaceNote(values: PlaceNoteValues): Promise<void> {
		const folder = this.settings.newNoteFolder.trim().replace(/^\/+|\/+$/g, '');
		if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
			try {
				await this.app.vault.createFolder(folder);
			} catch (error) {
				console.warn('[life-map] could not create folder', error);
			}
		}

		const base = sanitizeFileName(values.name);
		let path = folder ? `${folder}/${base}.md` : `${base}.md`;
		let index = 2;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = folder ? `${folder}/${base}-${index}.md` : `${base}-${index}.md`;
			index++;
		}

		try {
			const file = await this.app.vault.create(path, buildPlaceNoteContent(values));
			await this.app.workspace.getLeaf(true).openFile(file);
			new Notice(`已创建 ${path}`);
			this.scheduleAutoRefresh(300);
		} catch (error) {
			console.error('[life-map] create note failed', error);
			new Notice('创建失败，请查看控制台');
		}
	}

	/** Features currently rendered in the first open map view (filters applied). */
	private visibleFeatures(): Feature[] {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LIFE_MAP)) {
			if (leaf.view instanceof LifeMapView) return leaf.view.getVisibleFeatures();
		}
		return this.results.flatMap((result) => result.features);
	}

	async exportGeoJson(): Promise<void> {
		const features = this.visibleFeatures();
		if (features.length === 0) {
			new Notice('当前视图没有可导出的地点');
			return;
		}
		const collection = {
			type: 'FeatureCollection',
			features: features.map((feature) => ({
				type: 'Feature',
				id: feature.id,
				geometry: { type: 'Point', coordinates: [feature.lng, feature.lat] },
				properties: {
					...feature.props,
					name: feature.name,
					time: feature.time,
					category: feature.category,
					tags: feature.tags,
					photos: feature.photos.map((photo) => photo.url),
					link: feature.link,
					source: feature.sourceId,
					coord_sys: 'WGS84',
				},
			})),
		};
		const path = await this.uniqueExportPath('geojson');
		await this.app.vault.create(path, JSON.stringify(collection, null, 2));
		new Notice(`已导出 ${features.length} 个地点 → ${path}`);
	}

	async exportMarkdown(): Promise<void> {
		const features = this.visibleFeatures();
		if (features.length === 0) {
			new Notice('当前视图没有可导出的地点');
			return;
		}
		const escape = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
		const rows = features.map((feature) => {
			const cells = [
				feature.name ?? '',
				feature.time ? feature.time.slice(0, 10) : '',
				feature.category ?? '',
				feature.tags.map((tag) => `#${tag}`).join(' '),
				`${feature.lat.toFixed(6)}, ${feature.lng.toFixed(6)}`,
				feature.link ?? '',
			];
			return `| ${cells.map((cell) => escape(cell)).join(' | ')} |`;
		});
		const content = [
			`# Life Map 导出（${new Date().toLocaleDateString('zh-CN')}）`,
			'',
			`共 ${features.length} 个地点，坐标为 WGS-84。`,
			'',
			'| 名称 | 日期 | 分类 | 标签 | 坐标 | 来源 |',
			'| --- | --- | --- | --- | --- | --- |',
			...rows,
			'',
		].join('\n');
		const path = await this.uniqueExportPath('md');
		await this.app.vault.create(path, content);
		new Notice(`已导出 ${features.length} 个地点 → ${path}`);
	}

	private async uniqueExportPath(extension: 'geojson' | 'md'): Promise<string> {
		const stamp = new Date().toISOString().slice(0, 10);
		const base = `life-map-export-${stamp}`;
		let path = `${base}.${extension}`;
		let index = 2;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = `${base}-${index}.${extension}`;
			index++;
		}
		return path;
	}

	scheduleAutoRefresh(delay = 1200): void {
		if (this.autoRefreshTimer !== null) window.clearTimeout(this.autoRefreshTimer);
		this.autoRefreshTimer = window.setTimeout(() => {
			this.autoRefreshTimer = null;
			if (this.app.workspace.getLeavesOfType(VIEW_TYPE_LIFE_MAP).length > 0) {
				void this.refreshFeatures();
			}
		}, delay);
	}
}
