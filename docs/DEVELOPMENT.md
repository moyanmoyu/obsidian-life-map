# 开发

> 面向改代码的人。普通用户看 [README](../README.md) 就够。

## 环境

- Node.js ≥ 20（CI 用 22）
- npm ≥ 11（npm 10 在这个依赖树上会崩，见下文「已知坑」）

## 常用命令

```bash
npm install                                        # 安装依赖
npm run dev                                        # 监听构建（改代码自动重编）
npm run typecheck                                  # 仅类型检查
npm run test                                       # 核心逻辑冒烟测试（坐标转换 / JSONPath / CSV）
npm run bench                                       # 数据管线基准（1k / 5k / 20k / 50k 点）
npm run fixture -- 5000 /path/to/vault/bench.geojson  # 生成压测数据
npm run build                                      # 生产构建
npm run deploy -- /path/to/vault                   # 构建产物拷进 vault 的插件目录
```

## 目录结构

```
src/
├── main.ts              插件入口：注册视图、命令、设置、代码块处理器
├── api.ts               给第三方插件用的扩展 API
├── service.ts           并行加载数据源 + 坐标归一化
├── settings.ts          设置结构与默认值
├── settings-tab.ts      设置面板
├── place-template.ts    「新建地点笔记」的模板生成
├── constants.ts
├── core/
│   ├── model.ts         Feature / CoordSys 数据模型
│   ├── coords.ts        WGS-84 / GCJ-02 / BD-09 转换
│   ├── places.ts        按地点聚合
│   ├── jsonpath.ts      JSONPath 子集（HTTP 源映射用）
│   ├── source.ts        DataSource 接口
│   ├── basemap.ts       Basemap 接口
│   └── registry.ts      源与底图的注册表
├── sources/             笔记属性 / GeoJSON / CSV / HTTP
├── basemaps/            天地图 / OpenFreeMap / 自定义 XYZ
├── view/                地图视图、侧栏、内嵌地图
└── ui/                  新建表单、删除确认
```

## 测试

- `npm run test`：跑 `scripts/smoke.ts`，覆盖坐标往返、JSONPath 取值、CSV 引号/BOM/CRLF
- `npm run bench`：只测 JS 数据管线（不含 WebGL），用来判断瓶颈
- 渲染层只能在 Obsidian 里手工验证（没有无头 WebGL 环境）

## 已知坑

**npm 10 会崩**：`npm ci` 可能输出 `npm error Exit handler never called!`，甚至返回 0，留下半装的 `node_modules`（表现为 `tsc: not found`）。CI 里已改成先 `npm install -g npm@11` 再装依赖，并在安装后校验 `tsc` / `esbuild` 是否存在。

**路径大小写**：CI 跑在 Linux 上，import 路径大小写必须与文件名完全一致（macOS 不敏感，容易漏）。

**`site/styles.css` 不能被忽略**：根 `.gitignore` 里的 `/styles.css` 必须带前导斜杠，否则会把站点样式也忽略掉。
