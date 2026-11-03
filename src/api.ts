import type { Basemap } from './core/basemap';
import type { Feature } from './core/model';
import type { DataSource, LoadResult } from './core/source';
import type LifeMapPlugin from './main';

/**
 * Public extension API.
 *
 * Third-party plugins (installed by the user, not written in settings) can add
 * data sources and basemaps:
 *
 * ```ts
 * const lifeMap = (app as any).plugins.getPlugin('life-map');
 * lifeMap?.api.registerSource({ id: 'my-src', name: '我的数据', async load() {
 *   return [{ id: 'my-src:1', sourceId: 'my-src', lat: 39.9, lng: 116.4,
 *            coordSys: 'WGS84', tags: [], photos: [], props: {} }];
 * }});
 * ```
 *
 * There is intentionally no user-editable scripting hook (see design doc §9).
 */
export interface LifeMapApi {
	readonly version: string;
	registerSource(source: DataSource): void;
	unregisterSource(id: string): void;
	registerBasemap(basemap: Basemap): void;
	refresh(): Promise<void>;
	getResults(): LoadResult[];
	getFeatures(): Feature[];
	open(): Promise<void>;
}

export class LifeMapApiImpl implements LifeMapApi {
	readonly version = '0.1.0';

	constructor(private readonly plugin: LifeMapPlugin) {}

	registerSource(source: DataSource): void {
		this.plugin.registry.registerSource(source);
		void this.plugin.refreshFeatures();
	}

	unregisterSource(id: string): void {
		this.plugin.registry.unregisterSource(id);
		void this.plugin.refreshFeatures();
	}

	registerBasemap(basemap: Basemap): void {
		this.plugin.registry.registerBasemap(basemap);
	}

	async refresh(): Promise<void> {
		await this.plugin.refreshFeatures();
	}

	getResults(): LoadResult[] {
		return this.plugin.results;
	}

	getFeatures(): Feature[] {
		return this.plugin.results.flatMap((result) => result.features);
	}

	async open(): Promise<void> {
		await this.plugin.activateView();
	}
}
