import type { App } from 'obsidian';
import type { Feature } from './model';
import type { LifeMapSettings } from '../settings';

export interface SourceContext {
	app: App;
	settings: LifeMapSettings;
	signal?: AbortSignal;
	/** Source-specific configuration (HTTP sources receive their HttpSourceConfig) */
	config?: unknown;
}

export interface DataSource {
	id: string;
	name: string;
	description?: string;
	/** Where the source comes from; used for grouping in settings UI */
	kind?: 'builtin' | 'http' | 'external';
	load(ctx: SourceContext): Promise<Feature[]>;
	/**
	 * Optional change subscription. Called after the vault is indexed or on a
	 * poll interval by the host; return an unsubscribe function.
	 */
	watch?(ctx: SourceContext, onChange: () => void): () => void;
}

export interface LoadResult {
	sourceId: string;
	name: string;
	color: string;
	features: Feature[];
	error?: string;
	/** Wall-clock milliseconds the load took */
	durationMs?: number;
}
