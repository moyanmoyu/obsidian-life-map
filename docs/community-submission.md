# 上架 Obsidian 社区目录

> **重要：提交方式已变更（2026-11 确认）**
> Obsidian 已停用 GitHub PR 流程。`obsidianmd/obsidian-releases` 现在不接受 Pull Request（其 PR API 直接返回 404），改为通过 [community.obsidian.md](https://community.obsidian.md) 网页提交。

## 0. 现状核实

| 检查项 | 结果 |
|---|---|
| 目录现有插件数 | ~9,900 |
| `id = life-map` 是否被占用 | ✅ 未占用（全目录检索） |
| 仓库可见性 | ✅ Public，默认分支 `main` |
| HEAD 的 manifest 版本 | ✅ 0.9.4（目录读取默认分支 HEAD 的 manifest） |
| GitHub Release | ✅ [v0.9.4](https://github.com/moyanmoyu/obsidian-life-map/releases/tag/v0.9.4)，含 main.js / manifest.json / styles.css |
| README / LICENSE | ✅ 根目录都有 |
| 遥测 / 网络披露 | ✅ README 已披露，无遥测 |
| 平台验证 | macOS ✅ · iOS ✅ · Android ✅ · Windows/Linux 未实测 |

一键自检：

```bash
npm run check:submission
```

## 1. 前置条件

1. **GitHub 账号**（已有，仓库公开）
2. **Obsidian 账号**（免费注册，用于登录 community.obsidian.md）
3. 仓库根目录包含：`README.md`、`LICENSE`、`manifest.json`
4. Release 的 tag 与 `manifest.json` 版本一致，且附带 `main.js` / `manifest.json` / `styles.css`

以上第 3、4 条当前都已满足。

## 2. 提交表单填写内容

字段级文案已整理在 [submission-form.md](submission-form.md)：一句话描述、长描述、分类建议、给审核方的说明、常见问答，可直接复制粘贴。

## 3. 提交步骤（只能由账号本人在网页完成）

1. 打开 https://community.obsidian.md 并用 Obsidian 账号登录
2. 进入个人资料，**关联 GitHub 账号**（用来验证你拥有这个仓库）
3. 选择 **Add plugin** / 提交插件
4. 填入仓库地址 `https://github.com/moyanmoyu/obsidian-life-map`，按表单填写分类等信息
5. 提交，等待官方审核

> 这一步需要登录你的 Obsidian 账号，我无法代做；前面所有材料都已就绪。

## 4. 目录会自动检查什么

| 检查点 | 说明 |
|---|---|
| `manifest.json` @ HEAD | 目录直接读默认分支 HEAD 的 manifest，必须是最新且已提交 |
| id 唯一性 | 不能与其他插件重复，且不能包含 `obsidian` 字样 |
| Release 资产 | 用户安装时按 manifest 版本下载对应 tag 的 `main.js` / `manifest.json` / `styles.css` |
| README 摘要 | 目录页会展示 README 摘要，相对图片链接（如 `docs/images/overview.jpg`）会被自动重写到仓库 |
| 开发者政策 | 无混淆、无遥测、无自更新机制、披露网络使用 |

## 5. 审核期间的常见退回原因

- manifest 版本与 Release tag 不一致 → 用 `npm run check:submission` 兜底
- README 没写网络使用 → 已有「Network access and privacy」章节
- 截图缺失 → 已有三张
- 移动端崩溃 → 已实测 iOS / Android
- id 冲突 → 已确认未占用

## 6. 上架后的版本更新

不需要重新提交。每次更新：

```bash
# 1. 改 manifest.json / package.json / versions.json 的版本号
npm run build
npm run test
npm run check:submission
# 2. 提交并打 tag
git commit -am "chore: release x.y.z"
git tag -a vX.Y.Z -m "Life Map vX.Y.Z"
git push origin main && git push origin vX.Y.Z
```

CI 会自动构建并发布 Release，目录会读取新的 manifest + 对应 tag 的资产。

## 7. 备注：已废弃的 PR 流程

旧的提交流程是在 `obsidianmd/obsidian-releases` 里编辑 `community-plugins.json` 并发 PR。该方式已不可用：

- 仓库的 `pulls` API 返回 404（PR 功能已关闭）
- 之前为此建的 fork（`moyanmoyu/obsidian-releases`）已无用处，可在 GitHub 仓库设置里删除
