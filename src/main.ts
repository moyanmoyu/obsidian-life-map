import { Notice, Plugin, type WorkspaceLeaf } from 'obsidian';
import { LifeMapApiImpl, type LifeMapApi } from './api';
import { BUILTIN_BASEMAPS } from './basemaps';
import { VIEW_TYPE_LIFE_MAP } from './constants';
import type { Feature } from './core/model';
import { Registry } from './core/registry';
import type { LoadResult } from './core/source';
import { FeatureService } from './service';
import { DEFAULT_SETTINGS, type LifeMapSettings } from './settings';
import { LifeMapSettingsTab } from './settings-tab';
import { CsvSource } from './sources/csv';
import { GeoJsonSource } from './sources/geojson';
import { VaultFrontmatterSource } from './sources/vault-frontmatter';
import { LifeMapView } from './view/map-view';

export default class LifeMapPlugin extends Plugin {
	settings!: LifeMapSettings;
	registry = new Registry();
	service!: FeatureService;
	results: LoadResult[] = [];
	api!: LifeMapApi;

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

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_LIFE_MAP);
		let leaf: WorkspaceLeaf;
		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_LIFE_MAP, active: true });
		}
		workspace.revealLeaf(leaf);
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
