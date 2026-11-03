import type { DataSource } from './source';
import type { Basemap } from './basemap';

/**
 * Runtime registry. Third-party plugins register additional sources and
 * basemaps through `plugin.api` (see src/api.ts) — there is intentionally no
 * user-editable scripting hook.
 */
export class Registry {
	private sources = new Map<string, DataSource>();
	private basemaps = new Map<string, Basemap>();

	registerSource(source: DataSource): void {
		if (this.sources.has(source.id)) {
			console.warn(`[life-map] source "${source.id}" registered twice, overwriting`);
		}
		this.sources.set(source.id, source);
	}

	unregisterSource(id: string): void {
		this.sources.delete(id);
	}

	registerBasemap(basemap: Basemap): void {
		if (this.basemaps.has(basemap.id)) {
			console.warn(`[life-map] basemap "${basemap.id}" registered twice, overwriting`);
		}
		this.basemaps.set(basemap.id, basemap);
	}

	getSource(id: string): DataSource | undefined {
		return this.sources.get(id);
	}

	getSources(): DataSource[] {
		return Array.from(this.sources.values());
	}

	getBasemap(id: string): Basemap | undefined {
		return this.basemaps.get(id);
	}

	getBasemaps(): Basemap[] {
		return Array.from(this.basemaps.values());
	}
}
