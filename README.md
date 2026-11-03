# Life Map

一个**通用的 Obsidian 地图视图**：把任意来源的地点数据画到一张国内可用的地图上。

- **笔记属性**：frontmatter 里有经纬度的笔记自动上屏
- **GeoJSON / CSV**：放进 vault 就能看
- **任意 HTTP API**：用 JSONPath 声明式映射，不写代码
- **图层面板**：多数据源叠加、单源开关、按颜色区分
- **筛选与搜索**：文本搜索 + 时间区间
- **侧边面板**：列表 / 照片墙 / 时间轴三种视图，点条目地图自动飞过去
- **照片大图**：点弹窗缩略图全屏查看，支持左右切换与 Esc 关闭
- **导出**：当前视图导出为 GeoJSON 或 Markdown 清单（数据不被锁死）
- **聚类**：点位密集时自动聚合
- **点开即回笔记**：弹窗里直接跳回对应 Markdown

## 安装

### 社区插件（待上架）

目前尚未提交到 Obsidian 社区目录，请先用下面的手动方式。

### 手动

```bash
npm install
npm run build
npm run deploy -- /path/to/your/vault
```

然后打开 Obsidian → 设置 → 第三方插件 → 关闭安全模式 → 启用 **Life Map**。

左侧栏出现地图图标，或命令面板执行「Life Map: 打开地图视图」。

## 快速开始

给任意笔记加上坐标：

```yaml
---
coordinates: ["39.9042", "116.4074"]
title: 示例地点
category: food
visited_at: 2025-03-02
tags: [life/places]
---
```

打开地图视图，点位就出现了。

## 在笔记里内嵌地图

在任意笔记里加一个 `life-map` 代码块，就地渲染一张小地图：

````markdown
```life-map
center: 40.0496, 116.2807
zoom: 14
height: 280
tag: life/places
interactive: false
```
````

| 选项 | 默认 | 说明 |
|---|---|---|
| `center` | 当前笔记的坐标 | 支持 `[lat, lng]` 或 `"lat,lng"`，**按 WGS-84 解释**；笔记无坐标时显示全国（笔记自身坐标会按 `coord_sys` 自动转换） |
| `zoom` | `13`（有中心时）/ `4` | 1–18 |
| `height` | `260` | 120–600 px |
| `tag` | 全部 | 只显示带该标签的点 |
| `limit` | `1000` | 最多渲染多少点 |
| `interactive` | `true` | `false` 时禁止拖动缩放，当静态图用 |

- 笔记自己有坐标时，会额外画一个**红色高亮点**标出当前笔记的位置
- 点击点位会跳转到对应笔记
- 同一页面最多同时渲染 6 个地图（每个地图占一个 WebGL 上下文）
- 点「打开完整地图」会**带上当前内嵌地图的视野范围和 `tag` 筛选**，不会一下跳到全量数据；筛选条可以一键移除

## 支持的数据源

### 1. 笔记属性（默认开启）

| 字段 | 默认属性 | 说明 |
|---|---|---|
| 坐标 | `coordinates` | `["lat","lng"]` 数组、`"lat,lng"` 字符串或 `{lat,lng}` 对象 |
| 备选坐标 | `latitude` / `longitude` | 上面取不到时使用 |
| 坐标系 | `coord_sys` | `WGS84`（默认）/ `GCJ02` / `BD09` |
| 名称 | `title` | 取不到用文件名 |
| 时间 | `visited_at` | 用于时间筛选 |
| 分类 | `category` | |
| 标签 | `tags` | 与文件标签合并 |
| 封面/相册 | `cover` / `photos` | wikilink、vault 路径或 URL |

属性名都可以在设置里改。

### 2. GeoJSON

把 `.geojson` 文件放进 vault 即可（扫描目录可在设置里限制）。当前只渲染 `Point` / `MultiPoint`，线、面暂不支持。

### 3. CSV

`.csv` 文件放进 vault，需包含经纬度列。自动识别列名：

| 目标 | 可识别列名 |
|---|---|
| 纬度 | `lat` / `latitude` / `纬度` / `y` |
| 经度 | `lng` / `lon` / `long` / `longitude` / `经度` / `x` |
| 名称 | `name` / `title` / `标题` / `名称` |
| 时间 | `time` / `date` / `visited_at` / `日期` |
| 分类 | `category` / `type` / `类型` |
| 标签 | `tags` / `标签` |

没有经纬度列的 CSV 会被跳过，不会误导入普通表格。

### 4. HTTP API（设置里添加）

只要接口返回 JSON，就能用字段映射接进来：

```jsonc
{
  "name": "我的生活记录",
  "url": "https://api.example.com/v1/pois",
  "headers": { "Authorization": "Bearer xxx" },
  "coordSys": "gcj02",
  "mapping": {
    "list": "$.data.items",
    "id": "$.id",
    "name": "$.title",
    "lat": "$.location.lat",
    "lng": "$.location.lng",
    "time": "$.visited_at",
    "category": "$.type",
    "tags": "$.tags[*]",
    "photos": "$.photos[*].url",
    "link": "$.url"
  }
}
```

支持的 JSONPath 子集：

| 语法 | 含义 |
|---|---|
| `$.a.b` | 属性访问 |
| `$.a[0].b` | 数组下标 |
| `$.a[*].b` | 通配展开（返回列表） |

请求由 Obsidian 的 `requestUrl` 发出，**不走浏览器 CORS**，后端无需配置跨域。目前只支持 GET。

> ⚠️ 请求头里的 token 明文保存在 `.obsidian/plugins/life-map/data.json`，请自行评估风险。

## 底图

| 底图 | 是否需要 Key | 说明 |
|---|---|---|
| 天地图（默认） | 需要 tk | 国内合规、访问稳定 |
| OpenFreeMap | 不需要 | 海外访问快，国内可能较慢 |
| 自定义 XYZ | 不需要 | 自建瓦片 / 企业瓦片 |

### 天地图 tk

1. 打开 https://console.tianditu.gov.cn/ 注册并创建应用
2. 类型选「浏览器端」，把 tk 填进插件设置
3. 天地图按 **User-Agent** 判断请求来源：用 curl 之类的工具直接请求会返回 `403 / 301012 权限类型错误`，而 Obsidian（Electron / Chromium UA）属于浏览器环境，可以正常取图。若你的环境仍被判定为非浏览器，再改用「服务端」类型 tk

未填 tk 时不会报错：插件会自动回退到 OpenFreeMap，并在视图顶部提示。

### 自定义瓦片

填 `https://example.com/{z}/{x}/{y}.png` 形式的模板即可。注意瓦片坐标系设置：高德/腾讯的栅格瓦片是 GCJ-02，天地图/自建通常是 WGS-84，选错会导致整体偏移。

## 扩展（给插件作者）

其他插件可以注册数据源和底图：

```ts
const lifeMap = (app as any).plugins.plugins['life-map'];
lifeMap?.api.registerSource({
  id: 'my-src',
  name: '我的数据',
  async load() {
    return [{
      id: 'my-src:1',
      sourceId: 'my-src',
      name: '某个地点',
      lat: 39.9042,
      lng: 116.4074,
      coordSys: 'WGS84',
      tags: [],
      photos: [],
      props: {},
    }];
  },
});
```

API：`registerSource` / `unregisterSource` / `registerBasemap` / `refresh` / `getResults` / `getFeatures` / `open`。

**不支持**在设置里写 JS 脚本自定义数据源——那等于任意代码执行，安全与审核都不可控。复杂数据请先转成 GeoJSON / CSV，或写一个注册数据源的插件。

## 已知限制（v0.1）

- 只渲染点，不支持线（GPX 轨迹）和面
- 单次全量加载，未做增量同步
- 建议点位数 ≤ 20,000（再多需要瓦片化/预聚合）
- 移动端未经充分测试

## 命令

| 命令 | 作用 |
|---|---|
| `Life Map: 打开地图视图` | 打开/聚焦地图 |
| `Life Map: 刷新地图数据` | 重新加载所有数据源 |
| `Life Map: 导出当前视图为 GeoJSON` | 按当前筛选结果导出（WGS-84） |
| `Life Map: 导出当前视图为 Markdown 清单` | 按当前筛选结果导出表格 |

## 兼容性

| 项 | 说明 |
|---|---|
| 最低 Obsidian 版本 | 1.5.0 |
| 桌面端 | macOS / Windows / Linux |
| 移动端 | iOS / Android（基础可用，未做深度适配） |
| 离线 | 数据源可离线；底图需要网络或瓦片缓存 |

## 网络访问与隐私

插件本身**不发送任何遥测**，也没有自动更新机制。联网只发生在这些情况：

| 场景 | 目标域名 | 说明 |
|---|---|---|
| 天地图底图 | `t0~t7.tianditu.gov.cn` | 用户自己申请 tk 后加载瓦片 |
| OpenFreeMap 底图 | `tiles.openfreemap.org` | 降级/海外底图 |
| 自定义瓦片 | 用户填写的地址 | 由用户自行配置 |
| HTTP 数据源 | 用户填写的地址 | 由用户自行配置，凭证存本地 |

- 凭证（HTTP 源的 token）明文保存在 `.obsidian/plugins/life-map/data.json`，请自行评估风险。
- 插件不收集、不上报任何点位、笔记或图片内容。
- 底图数据版权归各厂商所有，插件不缓存、不转售。

## 隐私与合规

- **无遥测**、无统计、不上报任何数据
- 联网仅限：用户配置的 HTTP 数据源、所选底图的瓦片服务
- 插件**不提供任何地图数据**，底图由用户自行选择并遵守对应厂商条款
- 天地图瓦片不得缓存后二次分发，且不可移除署名

## 开发

```bash
npm install
npm run dev        # 监听构建
npm run typecheck  # 类型检查
npm run test       # 核心逻辑冒烟测试（坐标转换 / JSONPath / CSV）
npm run bench      # 数据管线基准（1k / 5k / 20k / 50k 点）
npm run fixture -- 5000 /path/to/vault/bench.geojson  # 生成压测数据
npm run build      # 生产构建
npm run deploy -- /path/to/vault
```

## License

MIT
