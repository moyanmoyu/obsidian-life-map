import { App, Modal, Notice, Setting } from 'obsidian';
import { COORD_SYSTEMS, type CoordSys } from '../core/model';
import type { PlaceNoteValues } from '../place-template';
import type { LifeMapSettings } from '../settings';

/** Minimal form for creating a place note without hand-writing frontmatter. */
export class NewPlaceModal extends Modal {
	private readonly settings: LifeMapSettings;
	private readonly onSubmit: (values: PlaceNoteValues) => void;

	private name = '';
	private lat = '';
	private lng = '';
	private category = '';
	private coordSys: CoordSys;

	constructor(app: App, settings: LifeMapSettings, onSubmit: (values: PlaceNoteValues) => void) {
		super(app);
		this.settings = settings;
		this.onSubmit = onSubmit;
		this.coordSys = settings.vault.coordSys;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: '新建地点笔记' });

		new Setting(contentEl).setName('名称').addText((text) => {
			text.setPlaceholder('例如：为明教育').onChange((value) => {
				this.name = value;
			});
			window.setTimeout(() => text.inputEl.focus(), 0);
		});

		new Setting(contentEl)
			.setName('纬度')
			.setDesc('南纬为负，例如 40.049613')
			.addText((text) =>
				text
					.setPlaceholder('40.049613')
					.onChange((value) => {
						this.lat = value;
					})
			);

		new Setting(contentEl)
			.setName('经度')
			.setDesc('西经为负，例如 116.280701')
			.addText((text) =>
				text
					.setPlaceholder('116.280701')
					.onChange((value) => {
						this.lng = value;
					})
			);

		new Setting(contentEl)
			.setName('坐标系')
			.setDesc('高德 / 腾讯给出的坐标是 GCJ-02；GPS、GeoJSON 通常是 WGS-84')
			.addDropdown((dropdown) => {
				for (const sys of COORD_SYSTEMS) dropdown.addOption(sys, sys);
				dropdown.setValue(this.coordSys);
				dropdown.onChange((value) => {
					this.coordSys = value as CoordSys;
				});
			});

		new Setting(contentEl).setName('分类').addText((text) =>
			text.setPlaceholder('可选，例如 吃饭 / 游玩').onChange((value) => {
				this.category = value;
			})
		);

		const actions = contentEl.createDiv({ cls: 'life-map-delete-actions' });
		const cancel = actions.createEl('button', { text: '取消' });
		cancel.addEventListener('click', () => this.close());

		const create = actions.createEl('button', { cls: 'mod-cta', text: '创建' });
		create.addEventListener('click', () => this.submit());
	}

	private submit(): void {
		const name = this.name.trim();
		const lat = Number(this.lat.trim());
		const lng = Number(this.lng.trim());

		if (!name) {
			new Notice('请填写名称');
			return;
		}
		if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
			new Notice('纬度不合法（-90 ~ 90）');
			return;
		}
		if (!Number.isFinite(lng) || Math.abs(lng) > 180) {
			new Notice('经度不合法（-180 ~ 180）');
			return;
		}

		this.onSubmit({ name, lat, lng, coordSys: this.coordSys, category: this.category });
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
