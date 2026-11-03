import { setIcon } from 'obsidian';
import type { Feature } from '../core/model';
import type { SidebarTab } from '../settings';

export interface SidebarItem {
	feature: Feature;
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
	{ id: 'list', label: '列表' },
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

/** Side panel with three presentations of the same filtered point set. */
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
		for (const item of this.sorted()) list.appendChild(this.buildRow(item));
	}

	private renderPhotos(): void {
		const withPhotos = this.sorted().filter((item) => item.feature.photos.length > 0);
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
					src: item.feature.photos[0].url,
					loading: 'lazy',
					alt: item.feature.name ?? '',
				},
			});
			const count = item.feature.photos.length;
			const caption = cell.createDiv({
				cls: 'life-map-side-photo-caption',
				text: count > 1 ? `${item.feature.name ?? '未命名'} +${count - 1}` : item.feature.name ?? '未命名',
			});
			caption.addEventListener('click', () => this.options.onSelect(item.index));
			cell.addEventListener('click', () => this.options.onSelect(item.index));
		}
	}

	private renderTimeline(): void {
		const groups = new Map<string, SidebarItem[]>();
		for (const item of this.sorted()) {
			const key = monthKey(item.feature.time);
			const bucket = groups.get(key) ?? [];
			bucket.push(item);
			groups.set(key, bucket);
		}
		for (const [label, items] of groups) {
			const group = this.body.createDiv({ cls: 'life-map-side-group' });
			group.createDiv({ cls: 'life-map-side-group-title', text: `${label} · ${items.length}` });
			for (const item of items) group.appendChild(this.buildRow(item));
		}
	}

	private buildRow(item: SidebarItem): HTMLElement {
		const row = document.createElement('div');
		row.addClass('life-map-side-item');
		if (item.index === this.activeIndex) row.addClass('is-active');

		const dot = row.createSpan({ cls: 'life-map-side-dot' });
		dot.style.backgroundColor = item.color;

		const main = row.createDiv({ cls: 'life-map-side-main' });
		main.createDiv({ cls: 'life-map-side-title', text: item.feature.name ?? '未命名地点' });

		const meta: string[] = [];
		if (item.feature.time) meta.push(shortDate(item.feature.time));
		if (item.feature.category) meta.push(item.feature.category);
		if (item.feature.photos.length > 0) meta.push(`图 ${item.feature.photos.length}`);
		if (meta.length > 0) main.createDiv({ cls: 'life-map-side-meta', text: meta.join(' · ') });

		row.addEventListener('click', () => this.options.onSelect(item.index));
		return row;
	}

	private sorted(): SidebarItem[] {
		// Date.parse per comparison is O(n log n) parses; precompute once.
		const decorated = this.items.map((item) => ({
			item,
			time: item.feature.time ? Date.parse(item.feature.time) : NaN,
		}));
		decorated.sort((a, b) => {
			const timeA = a.time;
			const timeB = b.time;
			if (Number.isFinite(timeA) && Number.isFinite(timeB)) return timeB - timeA;
			if (Number.isFinite(timeA)) return -1;
			if (Number.isFinite(timeB)) return 1;
			return (a.item.feature.name ?? '').localeCompare(b.item.feature.name ?? '');
		});
		return decorated.map((entry) => entry.item);
	}
}
