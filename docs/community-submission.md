# 上架 Obsidian 社区目录

> 依据：https://docs.obsidian.md/community-directory/developer-policies
> 提交入口：https://github.com/obsidianmd/obsidian-releases（编辑 `community-plugins.json` 并发 PR）

## 0. 现状核实（2026-11-04）

| 检查项 | 结果 |
|---|---|
| 目录现有插件数 | 9,883 |
| `id = life-map` 是否被占用 | ✅ 未占用 |
| `name = Life Map` 是否被占用 | ✅ 未占用 |
| 仓库可见性 | ✅ Public |
| Release | ✅ [v0.9.4](https://github.com/moyanmoyu/obsidian-life-map/releases/tag/v0.9.4)，含 main.js / manifest.json / styles.css |
| 版本一致性 | ✅ manifest = package = versions = 0.9.4 |
| LICENSE | ✅ MIT |
| 遥测 | ✅ 无 |
| 网络使用 | ✅ README 已披露 |

一键自检：

```bash
npm run check:submission
```

## 1. 要加到 community-plugins.json 的条目

在数组**末尾**追加（注意逗号）：

```json
{
  "id": "life-map",
  "name": "Life Map",
  "author": "moyu",
  "description": "Plot notes, GeoJSON, CSV and any JSON API on one map, with layers, filters, clustering, photo wall and timeline.",
  "repo": "moyanmoyu/obsidian-life-map"
}
```

- `id` 必须与 `manifest.json` 完全一致
- `description` 建议与 manifest 一致（112 字符，上限 250）
- `repo` 是 `用户名/仓库名`，不带域名

## 2. 提交步骤

```bash
# 1) fork 并克隆
#    在 GitHub 网页点 obsidianmd/obsidian-releases 的 Fork，然后：
git clone https://github.com/<你的用户名>/obsidian-releases.git
cd obsidian-releases

# 2) 新建分支
git checkout -b add-life-map

# 3) 编辑 community-plugins.json，在数组末尾追加上面的条目

# 4) 校验 JSON 合法（少个逗号整个文件就挂了）
node -e "JSON.parse(require('fs').readFileSync('community-plugins.json','utf8')); console.log('JSON OK')"

# 5) 提交并推送
git add community-plugins.json
git commit -m "Add plugin: Life Map"
git push -u origin add-life-map
```

6. 在 GitHub 上向 `obsidianmd/obsidian-releases` 发 PR，标题：**`Add plugin: Life Map`**
7. 描述直接粘贴 [pr-body.md](pr-body.md)

## 3. 审核关注点

Obsidian 会逐项核对，重点在这几条：

| 审核点 | 我们的状态 |
|---|---|
| manifest 字段完整 | ✅ 已自检 |
| Release 资产齐全 | ✅ 三个文件 |
| 版本号与 tag 一致 | ✅ v0.9.2 |
| 无代码混淆 | ✅ 源码公开（minify 属于压缩，不是混淆） |
| 无客户端遥测 | ✅ |
| 无插件自更新机制 | ✅ 更新只走目录 |
| README 披露网络使用 | ✅ 底图与用户自配 API |
| 付费 / 账号要求 | ✅ 无 |
| 桌面端 + 移动端可运行 | ✅ macOS 实测、iOS 实测（iPhone）；Windows/Linux/Android 未实测 |

## 4. 截图（已完成）

`docs/images/` 下已有三张（overview / popup / inline-map），README 中英双语都引用了。

## 5. 平台验证状态

| 平台 | 状态 | 说明 |
|---|---|---|
| macOS | ✅ | 实机测试：地图、聚合、侧栏、内嵌地图、删除、导出 |
| iOS | ✅ | iPhone 实机：地图渲染、弹窗、内嵌地图、侧栏；窄屏工具栏与底部抽屉遮挡问题已在 0.9.3 / 0.9.4 修复并复测通过 |
| Windows / Linux | ❌ | 仅 CI 编译通过，未实机运行 |
| Android | ❌ | 未实测 |

> 插件没有使用任何平台专用 API（无 `electron`、无 `process.platform`），跨平台风险主要在 WebGL 与窄屏布局，这两项已在 iOS 上验证。

## 6. 旧版「提交前还差截图」段落

目录页面和 PR 都会看 README 里的截图。建议：

1. 打开地图视图，截一张**带侧栏和聚合点**的图
2. 截一张**弹窗 + 照片**的图
3. 截一张**笔记内嵌地图**的图
4. 用示例数据，别用真实个人记录
5. 存到 `docs/images/`，README 顶部插入：

```markdown
![Life Map](docs/images/overview.png)
```

## 5. 上架后的版本更新

不需要再改 `community-plugins.json`，只要求：

```bash
# 改版本号 → 构建 → 测试 → 提交 → 打 tag → 推送
npm run check:submission
git tag -a vX.Y.Z -m "Life Map vX.Y.Z"
git push origin main && git push origin vX.Y.Z
```

CI 会自动发 Release，目录里的版本会自动读取 release 的 manifest。

## 6. 常见被拒原因（提前避开）

- PR 里同时改了别的文件 → 只改 `community-plugins.json`
- JSON 语法错误 → 提交前跑一遍上面的 `JSON.parse`
- tag 与 manifest 版本不一致 → 用 `npm run check:submission` 兜底
- README 没有网络使用说明 → 已有「网络访问与隐私」章节
- 移动端崩溃 → 声明了 `isDesktopOnly: false`，提交前最好在手机上装一次
- 描述里塞关键词 → 保持与 manifest 一致、客观描述
