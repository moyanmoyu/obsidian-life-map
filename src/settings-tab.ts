import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { COORD_SYSTEMS } from './core/model';
import type LifeMapPlugin from './main';
import { createDefaultHttpSource, type HttpSourceConfig, type VaultSourceSettings } from './settings';

export class LifeMapSettingsTab extends PluginSettingTab {
	private readonly plugin: LifeMapPlugin;

	constructor(app: App, plugin: LifeMapPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.renderBasemapSection(containerEl);
		this.renderVaultSection(containerEl);
		this.renderHttpSection(containerEl);
		this.renderHelpSection(containerEl);
	}

	// ---------------------------------------------------------------- basemap

	private renderBasemapSection(parent: HTMLElement): void {
		new Setting(parent).setName('底图').setHeading();

		new Setting(parent)
			.setName('底图来源')
			.setDesc('国内建议天地图；未填 tk 自动回退。想用高德底图：切到「自定义瓦片」后点下方「使用高德底图」')
			.addDropdown((dropdown) => {
				for (const basemap of this.plugin.registry.getBasemaps()) {
					dropdown.addOption(basemap.id, basemap.name);
				}
				dropdown.setValue(this.plugin.settings.basemapId);
				dropdown.onChange(async (value) => {
					this.plugin.settings.basemapId = value;
					await this.save();
				});
			});

		new Setting(parent)
			.setName('高德底图预设')
			.setDesc(
				'一键填入高德栅格瓦片并切到 GCJ-02。仅供个人自用：瓦片版权归高德，对外分发需自行取得授权'
			)
			.addButton((button) =>
				button.setButtonText('使用高德底图').onClick(async () => {
					this.plugin.settings.customXyzUrl =
						'https://wprd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scl=1&style=7&x={x}&y={y}&z={z}';
					this.plugin.settings.customXyzCoordSys = 'GCJ02';
					this.plugin.settings.customXyzAttribution = '© 高德地图';
					this.plugin.settings.basemapId = 'custom-xyz';
					await this.save();
					new Notice('已切换到高德瓦片；若一直白屏说明服务端限制了该地址');
					this.display();
				})
			);

		new Setting(parent)
			.setName('天地图 tk')
			.setDesc('在 console.tianditu.gov.cn 申请，类型选「浏览器端」。若控制台报「权限类型错误 / 301012」，请改用「服务端」类型。')
			.addText((text) =>
				text
					.setPlaceholder('粘贴你的 tk')
					.setValue(this.plugin.settings.tiandituKey)
					.onChange(async (value) => {
						this.plugin.settings.tiandituKey = value.trim();
						await this.save();
					})
			);

		this.textField(
			parent,
			'自定义瓦片 URL',
			'形如 https://example.com/{z}/{x}/{y}.png；留空则不启用',
			this.plugin.settings.customXyzUrl,
			(value) => {
				this.plugin.settings.customXyzUrl = value.trim();
			}
		);

		new Setting(parent)
			.setName('自定义瓦片坐标系')
			.setDesc('高德 / 腾讯的栅格瓦片是 GCJ-02，天地图 / 自建瓦片通常是 WGS-84')
			.addDropdown((dropdown) => {
				for (const sys of COORD_SYSTEMS) dropdown.addOption(sys, sys);
				dropdown.setValue(this.plugin.settings.customXyzCoordSys);
				dropdown.onChange(async (value) => {
					this.plugin.settings.customXyzCoordSys = value as typeof this.plugin.settings.customXyzCoordSys;
					await this.save();
				});
			});

		this.textField(
			parent,
			'自定义瓦片署名',
			'显示在地图右下角的版权信息',
			this.plugin.settings.customXyzAttribution,
			(value) => {
				this.plugin.settings.customXyzAttribution = value.trim();
			}
		);

		new Setting(parent).setName('显示版权信息').addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.showAttribution).onChange(async (value) => {
				this.plugin.settings.showAttribution = value;
				await this.save();
			})
		);

		new Setting(parent)
			.setName('深色主题使用暗色底图')
			.setDesc('跟随 Obsidian 的明暗主题切换底图；关闭后始终使用浅色底图')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.followTheme).onChange(async (value) => {
					this.plugin.settings.followTheme = value;
					await this.save();
				})
			);
	}

	// ------------------------------------------------------------------ vault

	private renderVaultSection(parent: HTMLElement): void {
		new Setting(parent).setName('笔记数据源').setHeading();

		new Setting(parent)
			.setName('启用笔记属性源')
			.setDesc('把 frontmatter 里带经纬度的笔记画到地图上')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabledSources.includes('vault')).onChange(async (value) => {
					this.toggleSource('vault', value);
					await this.save();
				})
			);

		new Setting(parent)
			.setName('启用 GeoJSON')
			.setDesc('扫描 vault 内所有 .geojson 文件')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabledSources.includes('geojson')).onChange(async (value) => {
					this.toggleSource('geojson', value);
					await this.save();
				})
			);

		new Setting(parent)
			.setName('启用 CSV')
			.setDesc('扫描 vault 内所有 .csv 文件（仅保留含经纬度列的表）')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabledSources.includes('csv')).onChange(async (value) => {
					this.toggleSource('csv', value);
					await this.save();
				})
			);

		this.textField(
			parent,
			'扫描目录',
			'留空 = 全库。多个目录用英文逗号分隔，例如 10-生活, 20-旅行',
			this.plugin.settings.vault.folders.join(', '),
			(value) => {
				this.plugin.settings.vault.folders = splitList(value);
			}
		);

		this.textField(
			parent,
			'必需标签',
			'留空 = 不限。只有带这些标签之一的笔记才会显示',
			this.plugin.settings.vault.requiredTags.join(', '),
			(value) => {
				this.plugin.settings.vault.requiredTags = splitList(value);
			}
		);

		new Setting(parent)
			.setName('笔记默认坐标系')
			.setDesc('笔记没写 coord_sys 属性时使用')
			.addDropdown((dropdown) => {
				for (const sys of COORD_SYSTEMS) dropdown.addOption(sys, sys);
				dropdown.setValue(this.plugin.settings.vault.coordSys);
				dropdown.onChange(async (value) => {
					this.plugin.settings.vault.coordSys = value as typeof this.plugin.settings.vault.coordSys;
					await this.save();
				});
			});

		this.textField(
			parent,
			'新建笔记位置',
			'「新建地点笔记」命令把笔记创建到这个目录；留空 = 库根目录',
			this.plugin.settings.newNoteFolder,
			(value) => {
				this.plugin.settings.newNoteFolder = value.trim();
			}
		);

		const details = parent.createEl('details', { cls: 'life-map-advanced' });
		details.createEl('summary', { text: '高级：属性名映射' });
		details.createEl('p', {
			cls: 'setting-item-description',
			text: '如果你的笔记用了别的属性名，在这里改。默认值兼容常见写法。',
		});

		type VaultStringKey = {
			[K in Exclude<keyof VaultSourceSettings, 'coordSys'>]: VaultSourceSettings[K] extends string
				? K
				: never;
		}[Exclude<keyof VaultSourceSettings, 'coordSys'>];

		const fields: { label: string; desc: string; key: VaultStringKey }[] = [
			{ label: '坐标属性', desc: '数组 ["lat","lng"] 或字符串 "lat,lng"', key: 'coordsProperty' },
			{ label: '纬度属性', desc: '坐标属性取不到时的备选', key: 'latProperty' },
			{ label: '经度属性', desc: '坐标属性取不到时的备选', key: 'lngProperty' },
			{ label: '坐标系属性', desc: '值可为 WGS84 / GCJ02 / BD09', key: 'coordSysProperty' },
			{ label: '名称属性', desc: '取不到时使用文件名', key: 'nameProperty' },
			{ label: '时间属性', desc: '用于时间筛选', key: 'timeProperty' },
			{ label: '分类属性', desc: '', key: 'categoryProperty' },
			{ label: '标签属性', desc: '', key: 'tagsProperty' },
			{ label: '封面属性', desc: 'wikilink / vault 路径 / URL', key: 'coverProperty' },
			{ label: '相册属性', desc: '数组，元素同上', key: 'photosProperty' },
		];

		for (const field of fields) {
			this.textField(
				details,
				field.label,
				field.desc,
				String(this.plugin.settings.vault[field.key] ?? ''),
				(value) => {
					this.plugin.settings.vault[field.key] = value.trim();
				}
			);
		}
	}

	// ------------------------------------------------------------------- http

	private renderHttpSection(parent: HTMLElement): void {
		new Setting(parent).setName('HTTP 数据源').setHeading();
		parent.createEl('p', {
			cls: 'setting-item-description',
			text: '用 JSONPath 把任意 JSON API 映射成点位，不需要写代码。请求由 Obsidian 发出，不走浏览器 CORS。',
		});

		if (this.plugin.settings.httpSources.length === 0) {
			parent.createEl('p', { cls: 'setting-item-description', text: '还没有配置 HTTP 数据源。' });
		}

		for (const config of this.plugin.settings.httpSources) {
			this.renderHttpSource(parent, config);
		}

		new Setting(parent).addButton((button) =>
			button
				.setButtonText('新增 HTTP 数据源')
				.setCta()
				.onClick(async () => {
					const config = createDefaultHttpSource(this.plugin.settings.httpSources.length);
					this.plugin.settings.httpSources.push(config);
					await this.save();
					this.display();
				})
		);
	}

	private renderHttpSource(parent: HTMLElement, config: HttpSourceConfig): void {
		const details = parent.createEl('details', { cls: 'life-map-http-source' });
		details.createEl('summary', { text: `${config.name || config.id}${config.url ? '' : '（未配置 URL）'}` });

		new Setting(details).setName('启用').addToggle((toggle) =>
			toggle.setValue(config.enabled).onChange(async (value) => {
				config.enabled = value;
				await this.save();
			})
		);

		new Setting(details).setName('名称').addText((text) =>
			text.setValue(config.name).onChange(async (value) => {
				config.name = value.trim();
				await this.save();
			})
		);

		new Setting(details)
			.setName('URL')
			.setDesc('返回 JSON 的 GET 接口')
			.addText((text) =>
				text
					.setPlaceholder('https://api.example.com/v1/pois')
					.setValue(config.url)
					.onChange(async (value) => {
						config.url = value.trim();
						await this.save();
					})
			);

		new Setting(details).setName('坐标系').addDropdown((dropdown) => {
			for (const sys of COORD_SYSTEMS) dropdown.addOption(sys, sys);
			dropdown.setValue(config.coordSys);
			dropdown.onChange(async (value) => {
				config.coordSys = value as HttpSourceConfig['coordSys'];
				await this.save();
			});
		});

		new Setting(details)
			.setName('请求头 JSON')
			.setDesc('例如 {"Authorization": "Bearer xxx"}')
			.addTextArea((area) => {
				area.inputEl.rows = 3;
				area.setValue(JSON.stringify(config.headers, null, 2));
				area.inputEl.addEventListener('blur', () => {
					void this.applyJson(area, (parsed) => {
						config.headers = parsed as Record<string, string>;
					});
				});
			});

		new Setting(details)
			.setName('字段映射 JSON')
			.setDesc('list / id / lat / lng 必填；支持 $.a.b、$.a[0].b、$.a[*].b')
			.addTextArea((area) => {
				area.inputEl.rows = 9;
				area.setValue(JSON.stringify(config.mapping, null, 2));
				area.inputEl.addEventListener('blur', () => {
					void this.applyJson(area, (parsed) => {
						config.mapping = parsed as HttpSourceConfig['mapping'];
					});
				});
			});

		new Setting(details).addButton((button) =>
			button
				.setButtonText('删除')
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.httpSources = this.plugin.settings.httpSources.filter(
						(item) => item.id !== config.id
					);
					await this.save();
					this.display();
				})
		);
	}

	// ------------------------------------------------------------------- help

	private renderHelpSection(parent: HTMLElement): void {
		new Setting(parent).setName('使用说明').setHeading();

		parent.createEl('p', {
			cls: 'setting-item-description',
			text: '给笔记加上坐标，打开地图视图即可看到：',
		});
		parent.createEl('pre', {
			cls: 'life-map-help-code',
			text: [
				'---',
				'coordinates: ["39.9042", "116.4074"]',
				'coord_sys: WGS84',
				'title: 示例地点',
				'visited_at: 2025-03-02',
				'category: food',
				'tags: [life/places]',
				'cover: "![[assets/places/cover.jpg]]"',
				'---',
			].join('\n'),
		});

		parent.createEl('p', {
			cls: 'setting-item-description',
			text: '也可以直接把 .geojson 或 .csv（需含 lat / lng 列）放进 vault。',
		});

		parent.createEl('p', {
			cls: 'setting-item-description',
			text: '扩展：其他插件可通过 app.plugins.plugins["life-map"].api.registerSource(...) 注册数据源。',
		});
	}

	// ---------------------------------------------------------------- helpers

	private textField(
		parent: HTMLElement,
		name: string,
		desc: string,
		value: string,
		apply: (value: string) => void
	): void {
		const setting = new Setting(parent).setName(name);
		if (desc) setting.setDesc(desc);
		setting.addText((text) =>
			text.setValue(value).onChange(async (next) => {
				apply(next);
				await this.save();
			})
		);
	}

	private toggleSource(id: string, enabled: boolean): void {
		const sources = new Set(this.plugin.settings.enabledSources);
		if (enabled) sources.add(id);
		else sources.delete(id);
		this.plugin.settings.enabledSources = Array.from(sources);
	}

	private async applyJson(
		area: { inputEl: HTMLTextAreaElement },
		apply: (parsed: unknown) => void
	): Promise<void> {
		try {
			const parsed: unknown = JSON.parse(area.inputEl.value || '{}');
			apply(parsed);
			await this.save();
		} catch {
			new Notice('JSON 格式不正确，未保存');
		}
	}

	private async save(): Promise<void> {
		await this.plugin.saveSettings();
	}
}

function splitList(value: string): string[] {
	return value
		.split(/[,，]/)
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}
