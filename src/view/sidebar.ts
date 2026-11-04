import { setIcon } from 'obsidian';
import type { Feature } from '../core/model';
import { flattenVisits, type PlaceGroup } from '../core/places';
import type { SidebarTab } from '../settings';

export interface SidebarItem {
	place: PlaceGroup;
	index: number;
	color: string;
}

export interface SidebarOptions {
	tab: SidebarTab;
	open: boolean;
	onSelect(index: number): void;
	onTabChange(tab: SidebarTab): void;
	onToggle(open: boolean): void;
}

const TABS: { id: SidebarTab; label: string }[] = [
	{ id: 'list', label: '地点' },
	{ id: 'photos', label: '照片' },
	{ id: 'timeline', label: '时间轴' },
];

function shortDate(iso: string): string {
	const date = new Date(iso);
	if (isNaN(date.getTime())) return iso;
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

function monthKey(iso: string | undefined): string {
	if (!iso) return '未记录时间';
	const date = new Date(iso);
	if (isNaN(date.getTime())) return '未记录时间';
	return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
}

/**
 * Side panel: one row per place in the list/photo tabs, one row per visit in
 * the timeline tab (a place visited three times shows up three times there).
 */
export class Sidebar {
	private readonly root: HTMLElement;
	private readonly tabBar: HTMLElement;
	private readonly body: HTMLElement;
	private readonly options: SidebarOptions;

	private items: SidebarItem[] = [];
	private activeIndex: number | null = null;
	private tab: SidebarTab;
	private open: boolean;

	constructor(parent: HTMLElement, options: SidebarOptions) {
		this.options = options;
		this.tab = options.tab;
		this.open = options.open;

		this.root = parent.createDiv({ cls: 'life-map-side' });
		const header = this.root.createDiv({ cls: 'life-map-side-header' });

		this.tabBar = header.createDiv({ cls: 'life-map-side-tabs' });
		for (const tab of TABS) {
			const button = this.tabBar.createEl('button', {
				cls: 'life-map-side-tab',
				text: tab.label,
			});
			button.dataset.tab = tab.id;
			button.addEventListener('click', () => this.setTab(tab.id));
		}

		const close = header.createEl('button', {
			cls: 'life-map-side-close',
			attr: { 'aria-label': '收起面板' },
		});
		setIcon(close, 'panel-right-close');
		close.addEventListener('click', () => this.setOpen(false));

		this.body = this.root.createDiv({ cls: 'life-map-side-body' });

		this.applyOpenState(false);
		this.syncTabs();
	}

	setOpen(open: boolean, notify = true): void {
		this.open = open;
		this.applyOpenState(notify);
		this.renderBody();
	}

	setTab(tab: SidebarTab): void {
		if (this.tab === tab) return;
		this.tab = tab;
		this.syncTabs();
		this.options.onTabChange(tab);
		this.renderBody();
	}

	render(items: SidebarItem[], activeIndex: number | null): void {
		this.items = items;
		this.activeIndex = activeIndex;
		this.renderBody();
	}

	private applyOpenState(notify: boolean): void {
		this.root.toggleClass('is-hidden', !this.open);
		if (notify) this.options.onToggle(this.open);
	}

	private syncTabs(): void {
		for (const button of Array.from(this.tabBar.querySelectorAll('button'))) {
			button.toggleClass('is-active', button.dataset.tab === this.tab);
		}
	}

	private renderBody(): void {
		this.body.empty();
		if (!this.open) return;

		if (this.items.length === 0) {
			this.body.createDiv({ cls: 'life-map-side-empty', text: '当前筛选下没有地点' });
			return;
		}

		if (this.tab === 'photos') this.renderPhotos();
		else if (this.tab === 'timeline') this.renderTimeline();
		else this.renderList();
	}

	private renderList(): void {
		const list = this.body.createDiv({ cls: 'life-map-side-list' });
		for (const item of this.sorted()) list.appendChild(this.buildPlaceRow(item));
	}

	private renderPhotos(): void {
		const withPhotos = this.sorted().filter((item) => item.place.photos.length > 0);
		if (withPhotos.length === 0) {
			this.body.createDiv({ cls: 'life-map-side-empty', text: '这些地点还没有照片' });
			return;
		}
		const grid = this.body.createDiv({ cls: 'life-map-side-photos' });
		for (const item of withPhotos) {
			const cell = grid.createDiv({ cls: 'life-map-side-photo' });
			if (item.index === this.activeIndex) cell.addClass('is-active');
			cell.createEl('img', {
				attr: {
					src: item.place.photos[0].url,
					loading: 'lazy',
					alt: item.place.name,
				},
			});
			const extra = item.place.visits.length > 1 ? ` · ${item.place.visits.length} 次` : '';
			cell.createDiv({ cls: 'life-map-side-photo-caption', text: `${item.place.name}${extra}` });
			cell.addEventListener('click', () => this.options.onSelect(item.index));
		}
	}

	private renderTimeline(): void {
		const groups = new Map<string, ReturnType<typeof flattenVisits>>();
		for (const entry of flattenVisits(this.items.map((item) => item.place))) {
			const key = monthKey(entry.visit.time);
			const bucket = groups.get(key) ?? [];
			bucket.push(entry);
			groups.set(key, bucket);
		}

		for (const [label, entries] of groups) {
			const group = this.body.createDiv({ cls: 'life-map-side-group' });
			group.createDiv({ cls: 'life-map-side-group-title', text: `${label} · ${entries.length}` });
			for (const entry of entries) {
				const item = this.items.find((candidate) => candidate.place.key === entry.place.key);
				if (!item) continue;
				group.appendChild(this.buildVisitRow(item, entry.visit));
			}
		}
	}

	private buildPlaceRow(item: SidebarItem): HTMLElement {
		const row = createDiv({
			cls:
				item.index === this.activeIndex
					? 'life-map-side-item is-active'
					: 'life-map-side-item',
		});

		const dot = row.createSpan({ cls: 'life-map-side-dot' });
		dot.style.backgroundColor = item.color;

		const main = row.createDiv({ cls: 'life-map-side-main' });
		main.createDiv({ cls: 'life-map-side-title', text: item.place.name });

		const meta: string[] = [];
		if (item.place.visits.length > 1) meta.push(`${item.place.visits.length} 次到访`);
		if (item.place.latest) meta.push(shortDate(item.place.latest));
		if (item.place.category) meta.push(item.place.category);
		if (item.place.photos.length > 0) meta.push(`图 ${item.place.photos.length}`);
		if (meta.length > 0) main.createDiv({ cls: 'life-map-side-meta', text: meta.join(' · ') });

		row.addEventListener('click', () => this.options.onSelect(item.index));
		return row;
	}

	private buildVisitRow(item: SidebarItem, visit: Feature): HTMLElement {
		const row = createDiv({
			cls:
				item.index === this.activeIndex
					? 'life-map-side-item is-active'
					: 'life-map-side-item',
		});

		const dot = row.createSpan({ cls: 'life-map-side-dot' });
		dot.style.backgroundColor = item.color;

		const main = row.createDiv({ cls: 'life-map-side-main' });
		main.createDiv({ cls: 'life-map-side-title', text: item.place.name });
		const meta: string[] = [];
		if (visit.time) meta.push(shortDate(visit.time));
		if (visit.photos.length > 0) meta.push(`图 ${visit.photos.length}`);
		if (meta.length > 0) main.createDiv({ cls: 'life-map-side-meta', text: meta.join(' · ') });

		row.addEventListener('click', () => this.options.onSelect(item.index));
		return row;
	}

	private sorted(): SidebarItem[] {
		return [...this.items].sort((a, b) => {
			const timeA = a.place.latest ? Date.parse(a.place.latest) : NaN;
			const timeB = b.place.latest ? Date.parse(b.place.latest) : NaN;
			if (Number.isFinite(timeA) && Number.isFinite(timeB)) return timeB - timeA;
			if (Number.isFinite(timeA)) return -1;
			if (Number.isFinite(timeB)) return 1;
			return a.place.name.localeCompare(b.place.name);
		});
	}
}
