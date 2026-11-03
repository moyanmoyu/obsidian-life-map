# 门户站（Cloudflare Pages）

纯静态站，不需要服务器、不需要数据库。5 个文件：

```
site/
├── index.html    单页门户（中文）
├── styles.css    样式（自动跟随系统深色模式）
├── favicon.svg   图标
├── robots.txt
└── _headers      Cloudflare Pages 安全响应头
```

## 方式一：Git 集成（推荐，推代码自动部署）

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 授权 GitHub，选中本仓库
3. 构建设置：

| 项 | 值 |
|---|---|
| Framework preset | None |
| Build command | 留空 |
| Build output directory | `site` |

4. Save and Deploy。之后每次 push 到主分支会自动重新部署，PR 会生成预览链接。

## 方式二：命令行直传（不接 Git 也行）

```bash
npx wrangler pages deploy site --project-name life-map-site
```

首次会要求登录 Cloudflare 账号并新建项目。

## 自定义域名

Pages 项目 → **Custom domains** → 添加域名（如 `lifemap.yourdomain.com`）。
如果域名托管在 Cloudflare，加一条 CNAME 即可，HTTPS 证书自动签发。

> 国内访问建议用**自己域名**而不是 `*.pages.dev`：后者在大陆访问不稳定。

## 免费额度（Cloudflare Pages 免费计划）

| 项 | 额度 |
|---|---|
| 带宽 / 请求数 | 不限 |
| 构建次数 | 每月 500 次 |
| 站点数 | 不限 |
| 自定义域名 & HTTPS | 免费 |

配套可用的免费服务：Workers（10 万请求/天，做下载计数之类的小逻辑）、R2（10GB 存储、出站免流量费，放截图/安装包）。

## 中国大陆访问的现实情况

- Cloudflare 免费计划走**海外节点**，大陆访问速度一般，偶尔不稳定；官方「中国网络」只对企业版开放。
- 若要国内稳定访问：需要 **ICP 备案** + 国内 CDN/对象存储（阿里云 OSS、腾讯云 COS），成本不高但需要备案主体。
- 折中方案：门户站放 Pages（给海外/能用代理的人看），**安装包放 GitHub Release 或国内可访问的对象存储**，两个链接都写进页面。

## 多语言

```
site/index.html      中文（默认，根路径）
site/en/index.html   英文（/en/）
```

两页互相有语言切换入口，并声明了 `hreflang`。新增语言时复制 `en/` 目录，改 `<html lang>`、导航和文案，再到两页补 `hreflang` 和切换链接。

## 上架前要改的地方

- 两个页面里的 GitHub 链接目前都是占位 `https://github.com/`，替换成真实仓库地址
- 需要真实截图时，把图片放进 `site/` 并在 `<div class="hero-visual">` 处替换（目前是纯 CSS/SVG 模拟图，不含任何真实数据）
