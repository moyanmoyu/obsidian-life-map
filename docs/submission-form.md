# 提交表单填写内容（community.obsidian.md）

> 用途：在 https://community.obsidian.md 提交插件时，按字段复制粘贴。
> 英文部分可以直接用，中文是该段落的说明。

## 1. 基本信息

| 字段 | 值 |
|---|---|
| Repository | `https://github.com/moyanmoyu/obsidian-life-map` |
| Plugin name | `Life Map` |
| Plugin ID | `life-map` |
| Version | `0.9.4` |
| Min Obsidian version | `1.5.0` |
| Author | `moyu` |
| License | `MIT` |
| Platforms | Desktop + Mobile |

## 2. 一句话描述（与 manifest 一致，112 字符）

```
Plot notes, GeoJSON, CSV and any JSON API on one map, with layers, filters, clustering, photo wall and timeline.
```

## 3. 目录页长描述（英文，可整段粘贴）

```
Life Map is a general-purpose map view for your vault. Any note with a coordinates property becomes a pin, and notes that share (almost) the same coordinate are aggregated into a single place marker — each note shows up as a visit inside the popup, so a café you visited three times is one marker with three entries.

Places can come from four sources: note frontmatter, GeoJSON files, CSV files with latitude/longitude columns, and any JSON API described with a JSONPath mapping (no scripting). The same data can also be rendered as a small map inside a note with a life-map code block.

The plugin ships no map data: you pick the basemap. Tianditu works well in mainland China with a free key and falls back to a keyless basemap when no key is configured; OpenFreeMap, AMap tiles (personal use) and custom XYZ tiles are also supported. Coordinates are converted between WGS-84 / GCJ-02 / BD-09 automatically, so pins line up with the basemap you choose.

Life Map does not do routing, does not include POI search, and does not send any telemetry.
```

## 4. 分类建议

目录表单里如果有分类/标签，按优先级选：

1. **Maps / Geography**
2. **Data visualization**
3. **Productivity**
4. **Note organization**

如果只能填一个：`Maps`。

## 5. 给审核方的说明（英文，可粘贴到 Notes / Additional info）

```
Network access
- Basemap tiles: tianditu.gov.cn (user's own free key), tiles.openfreemap.org (keyless fallback), or a custom XYZ template the user configures.
- HTTP data sources: only endpoints the user configures themselves.
- No telemetry, no analytics, no remote code loading, no self-updater. MapLibre GL JS is bundled in main.js.

Data and credentials
- Coordinates, notes and photos stay in the vault. The plugin uploads nothing.
- Credentials the user enters (Tianditu tk, HTTP tokens) are stored locally in .obsidian/plugins/life-map/data.json.

Destructive actions
- Deleting a record only works on vault Markdown notes, always shows a confirmation dialog, and uses Obsidian's own fileManager.trashFile (recoverable from trash).

Licensing
- The plugin ships no map data. Basemap copyright belongs to the respective providers; the README documents this and the attribution is shown on the map.

Testing
- macOS: full manual test (map, clustering, sidebar, inline maps, delete, export).
- iOS and Android: manual test on real devices (rendering, popups, inline map, narrow-screen layout).
- Windows/Linux: not personally tested; the plugin uses no platform-specific APIs (no electron, no process.platform) and only Obsidian APIs plus WebGL.

Known limitations
- Points only (no polylines or polygons).
- Full reload on refresh, no incremental sync.
- Recommended up to ~20,000 places.
```

## 6. 可能被问到的问题

| 问题 | 回答 |
|---|---|
| 为什么需要网络访问？ | 只用于加载用户选择的底图瓦片，以及用户自己配置的 HTTP 数据源。 |
| 会收集用户数据吗？ | 不会。无遥测、无统计、不上传笔记/坐标/图片。 |
| 为什么插件里没有地图数据？ | 底图由用户选择并自行承担授权，插件只做渲染层，因此不需要测绘资质。 |
| 没有天地图 tk 会怎样？ | 自动降级到免 Key 的 OpenFreeMap，并在界面上提示，不会白屏或报错。 |
| 删除笔记是永久的吗？ | 不是，走 Obsidian 回收站，可恢复，且每次删除都有二次确认。 |

## 7. 提交前最后一分钟检查

```bash
npm run check:submission   # manifest / 版本 / LICENSE / 披露 / 无密钥
```
