import type { CoordSys } from './core/model';

/** Marker colour palette, assigned to sources in registration order. */
export const SOURCE_COLORS = [
	'#e5484d',
	'#f76b15',
	'#f5b301',
	'#30a46c',
	'#0091ff',
	'#8e4ec6',
	'#d6409f',
	'#12a594',
	'#6e56cf',
	'#ab6400',
];

export interface VaultSourceSettings {
	/** Only scan these folders (empty = whole vault) */
	folders: string[];
	/** Only notes carrying at least one of these tags (empty = all) */
	requiredTags: string[];
	/** Coordinate properties, tried in this order */
	coordsProperty: string;
	latProperty: string;
	lngProperty: string;
	/** Per-note coordinate system property (falls back to `coordSys` below) */
	coordSysProperty: string;
	nameProperty: string;
	timeProperty: string;
	photosProperty: string;
	coverProperty: string;
	tagsProperty: string;
	categoryProperty: string;
	/** Default coordinate system when a note does not declare one */
	coordSys: CoordSys;
}

export interface HttpSourceMapping {
	/** Path to the array of records, e.g. `$.data.items` */
	list: string;
	id: string;
	name?: string;
	lat: string;
	lng: string;
	time?: string;
	category?: string;
	tags?: string;
	photos?: string;
	link?: string;
	/** Optional path to a coordinate-system string per record */
	coordSys?: string;
}

export interface HttpSourceConfig {
	id: string;
	name: string;
	enabled: boolean;
	color: string;
	url: string;
	headers: Record<string, string>;
	coordSys: CoordSys;
	mapping: HttpSourceMapping;
}

export type SidebarTab = 'list' | 'photos' | 'timeline';

export interface LifeMapSettings {
	/** Basemap id from the registry */
	basemapId: string;
	/** 天地图 token (https://console.tianditu.gov.cn) */
	tiandituKey: string;
	/** Custom raster tile template, e.g. `https://example.com/{z}/{x}/{y}.png` */
	customXyzUrl: string;
	customXyzAttribution: string;
	/** Coordinate system of the custom XYZ tiles (高德/腾讯 raster tiles are GCJ-02) */
	customXyzCoordSys: CoordSys;
	showAttribution: boolean;
	/** Follow the Obsidian theme: use a dark basemap when the theme is dark */
	followTheme: boolean;
	/** Enabled data source ids (built-ins + vault + http ids) */
	enabledSources: string[];
	vault: VaultSourceSettings;
	httpSources: HttpSourceConfig[];
	/** Sidebar (list / photo wall / timeline) */
	sidebarOpen: boolean;
	sidebarTab: SidebarTab;
	/** Cluster radius in px */
	clusterRadius: number;
	/** Max zoom at which clustering still happens */
	clusterMaxZoom: number;
}

export const DEFAULT_SETTINGS: LifeMapSettings = {
	basemapId: 'tianditu',
	tiandituKey: '',
	customXyzUrl: '',
	customXyzAttribution: '',
	customXyzCoordSys: 'WGS84',
	showAttribution: true,
	followTheme: true,
	enabledSources: ['vault', 'geojson', 'csv'],
	sidebarOpen: true,
	sidebarTab: 'list',
	clusterRadius: 48,
	clusterMaxZoom: 13,
	vault: {
		folders: [],
		requiredTags: [],
		coordsProperty: 'coordinates',
		latProperty: 'latitude',
		lngProperty: 'longitude',
		coordSysProperty: 'coord_sys',
		nameProperty: 'title',
		timeProperty: 'visited_at',
		photosProperty: 'photos',
		coverProperty: 'cover',
		tagsProperty: 'tags',
		categoryProperty: 'category',
		coordSys: 'WGS84',
	},
	httpSources: [],
};

export function createDefaultHttpSource(index: number): HttpSourceConfig {
	return {
		id: `http-${Date.now().toString(36)}-${index}`,
		name: '我的 API',
		enabled: true,
		color: SOURCE_COLORS[index % SOURCE_COLORS.length],
		url: '',
		headers: {},
		coordSys: 'GCJ02',
		mapping: {
			list: '$.data',
			id: '$.id',
			name: '$.name',
			lat: '$.lat',
			lng: '$.lng',
			time: '$.time',
			category: '$.category',
			tags: '$.tags',
			photos: '$.photos[*].url',
			link: '$.link',
		},
	};
}
