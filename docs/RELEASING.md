# 发版

> 维护者文档。发布前请完整走一遍。

## 1. 不要带上你的 Key

插件运行时把设置存在 vault 里：

```
<vault>/.obsidian/plugins/life-map/data.json
```

里面有天地图 `tk`、HTTP 数据源的 token 等。**这个文件不在插件仓库里**，所以正常发版不会带上它。

保险措施：

| 措施 | 作用 |
|---|---|
| `.gitignore` 忽略 `data.json` / `*.zip` | 防止误提交 |
| `npm run package` 白名单打包 | 只打 `manifest.json` / `main.js` / `styles.css`，并拒绝 `data.json` |
| CI 只上传三个文件 | Release 资产不含任何设置 |

⚠️ **手动分享时不要直接压缩 `.obsidian/plugins/life-map/` 整个目录**，用 `npm run package`。

⚠️ 如果不小心把 key 提交到了公开仓库，删文件不够（历史里还在），必须去控制台**吊销并重新申请**。

## 2. 版本一致性

三处必须一致：

```bash
node -p "require('./manifest.json').version"   # 0.9.2
node -p "require('./package.json').version"    # 0.9.2
node -p "Object.keys(require('./versions.json')).pop()"  # 0.9.2
```

CI 也会校验 `tag` 与 `manifest.json` 的版本是否匹配。

## 3. 发布流程

```bash
# 改版本号（manifest.json / package.json / versions.json）
npm run build          # 本地确认能构建
npm run test           # 冒烟测试
git add -A && git commit -m "chore: release x.y.z"
git tag -a vX.Y.Z -m "Life Map vX.Y.Z"
git push origin main
git push origin vX.Y.Z   # 触发 CI：构建 + 校验版本 + 上传三个资产
```

## 4. 手动发行包

```bash
npm run package   # 生成 life-map-x.y.z.zip（只含三个文件）
```

## 5. 上架 Obsidian 社区目录

见 [community-submission.md](community-submission.md)。
