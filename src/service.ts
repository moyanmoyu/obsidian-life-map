import type { App } from 'obsidian';
import { toWGS84 } from './core/coords';
import type { Feature } from './core/model';
import type { Registry } from './core/registry';
import type { DataSource, LoadResult } from './core/source';
import { isFeature } from './sources/helpers';
import { createHttpSource } from './sources/http';
import { SOURCE_COLORS, type LifeMapSettings } from './settings';

/**
 * Loads every enabled source in parallel and normalises the result to WGS-84.
 * A failing source never takes the map down: the error is reported per source.
 */
export class FeatureService {
	constructor(
		private app: App,
		private registry: Registry,
		private getSettings: () => LifeMapSettings
	) {}

	/** Built-in (registered) sources plus the user-configured HTTP sources. */
	listSources(): DataSource[] {
		const settings = this.getSettings();
		const sources: DataSource[] = [];
		for (const source of this.registry.getSources()) {
			if (settings.enabledSources.includes(source.id)) sources.push(source);
		}
		for (const config of settings.httpSources) {
			if (config.enabled) sources.push(createHttpSource(config));
		}
		return sources;
	}

	async loadAll(signal?: AbortSignal): Promise<LoadResult[]> {
		const settings = this.getSettings();
		const sources = this.listSources();

		return Promise.all(
			sources.map(async (source, index): Promise<LoadResult> => {
				const color = SOURCE_COLORS[index % SOURCE_COLORS.length];
				const started = Date.now();
				try {
					const raw = await source.load({ app: this.app, settings, signal });
					const features = raw
						.filter(isFeature)
						.map(normalizeFeature)
						.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng));
					return {
						sourceId: source.id,
						name: source.name,
						color,
						features,
						durationMs: Date.now() - started,
					};
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					console.error(`[life-map] source "${source.id}" failed:`, error);
					return {
						sourceId: source.id,
						name: source.name,
						color,
						features: [],
						error: message,
						durationMs: Date.now() - started,
					};
				}
			})
		);
	}
}

function normalizeFeature(feature: Feature): Feature {
	const [lat, lng] = toWGS84(feature.lat, feature.lng, feature.coordSys);
	return {
		...feature,
		lat,
		lng,
		coordSys: 'WGS84',
		tags: feature.tags ?? [],
		photos: feature.photos ?? [],
		props: feature.props ?? {},
	};
}
