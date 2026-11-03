# 上架 Obsidian 社区目录：提交清单

> 依据：https://docs.obsidian.md/community-directory/developer-policies
> 提交入口：https://github.com/obsidianmd/obsidian-releases（编辑 `community-plugins.json` 并发 PR）

## 1. 硬性要求（不满足必被拒）

| 要求 | 本项目现状 | 检查方式 |
|---|---|---|
| 仓库公开、含 `LICENSE` | ✅ MIT | 看仓库根目录 |
| `manifest.json` 字段齐全 | ✅ id/name/version/minAppVersion/description/author/isDesktopOnly | `npm run build` 后检查 |
| 不混淆代码 | ✅ esbuild 未开启混淆之外的字符替换？见备注 | 提交源码，未做字符串加密 |
| 无客户端遥测 | ✅ 零上报 | 全局搜索 telemetry/analytics |
| 无插件自更新机制 | ✅ 更新只走 Obsidian 目录 | 无 fetch 版本号逻辑 |
| README 披露网络使用 | ✅ 见「网络访问与隐私」 | 检查 README |
| 版本号三处一致 | ✅ manifest / package.json / versions.json | `npm run build` 不校验，用下方脚本 |
| Release 资产含 main.js / manifest.json / styles.css | ✅ CI workflow 自动上传 | 看 GitHub Releases |

> 备注：esbuild 的 `minify` 会压缩标识符，这是允许的；政策禁止的是「混淆代码以隐藏用途」，所以必须**公开源码**，且不能用字符串加密/自解压那类手段。

## 2. 版本一致性自检

```bash
node -p "require('./manifest.json').version"
node -p "require('./package.json').version"
node -p "Object.keys(require('./versions.json')).pop()"
git tag --points-at HEAD
```

四个值必须完全一致（tag 形如 `0.2.0`，不带 `v` 前缀）。

## 3. 发版流程

```bash
# 1. 改版本号：manifest.json / package.json / versions.json 三处
# 2. 构建
npm run build
# 3. 提交并打 tag
git add -A && git commit -m "chore: release 0.2.0"
git tag 0.2.0
git push && git push --tags
# 4. GitHub Actions 会自动创建 Release 并上传三个产物
```

然后在 GitHub Release 页面确认：`main.js`、`manifest.json`、`styles.css` 三个资产都在。

## 4. 提交到社区目录

1. Fork `obsidianmd/obsidian-releases`
2. 在 `community-plugins.json` 数组末尾追加：

```json
{
  "id": "life-map",
  "name": "Life Map",
  "author": "moyu",
  "description": "Plot notes, GeoJSON, CSV and any JSON API on one map, with layers, filters, clustering, photo wall and timeline.",
  "repo": "your-github-name/obsidian-life-map"
}
```

3. 提 PR，标题：`Add plugin: Life Map`
4. 在 PR 描述里写清：插件做什么、是否有网络请求（有，底图与用户配置的 API）、是否有付费（无）

## 5. 常见被拒原因（提前自查）

- README 没写网络请求 → 已有「网络访问与隐私」章节
- Release 里漏了 `styles.css` → CI 已包含
- 用了 `console.log` 泄漏隐私数据 → 本项目只打印错误对象
- 插件 id 与其他插件重名 → `life-map` 目前未占用
- 首次加载直接发请求（审核会问）→ 本项目启动时会加载已启用数据源，README 已说明
- 移动端崩溃 → 已声明 `isDesktopOnly: false`，需在移动端实测过再提交

## 6. 提交前手动验收

- [ ] 全新 vault 安装后打开地图，出现引导卡片而不是空白
- [ ] 加一条带 `coordinates` 的笔记，刷新后出现点位
- [ ] 深浅主题切换，底图正确变色且点位不反色
- [ ] 移动端打开不白屏、能拖动缩放
- [ ] 断网后打开：底图空白但界面不崩、有提示
