# Issue 通知（Bark → iPhone）

有人新开 issue 时，通过 GitHub Actions 推送到你的 iPhone。

## 为什么用 Bark

- 基于 Apple 推送（APNs），国内可达，不需要代理
- 免费、开源、无需注册账号
- 可以带标题、正文、点击跳转 issue 链接

## 一次性配置

### 1. 安装 Bark

App Store 搜索 **Bark**（图标是一个铃铛），安装后打开，复制首页显示的设备 Key：

```
https://api.day.app/AbCdEf123456/...
                     ^^^^^^^^^^^^ 这一段就是 Key
```

### 2. 把 Key 存到 GitHub Secrets

仓库 → **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `BARK_KEY` | 上一步复制的 Key |

> 想用自建 Bark 服务器的话，再建一个 **Variables**（注意是 Variables 不是 Secrets）：
> `BARK_SERVER` = `https://你的域名`，默认是 `https://api.day.app`

### 3. 完成

之后有人提 issue，iPhone 会收到：

```
🐛 [issue 标题]
来自 @用户名
正文前 300 字…
```

点通知直接打开 issue 页面。

## 行为说明

- 触发条件：`issues: [opened, reopened]`
- 没配置 `BARK_KEY` 时工作流直接跳过，不会报错
- 推送失败只打印日志，不影响 issue 本身
- 通知分组为 `Life Map`，可在 Bark App 里单独设置

## 可选：AI 自动分类

配置后，新 issue 会先经过一次 AI 分类，然后：

1. 自动打上 `bug` / `enhancement` / `question` / `documentation` 标签
2. Bark 通知标题带上分类、正文带上 AI 生成的一句话摘要
3. （可选）自动发一条初步回复，向提问者索要复现信息

### 配置

**Secrets**（仓库 Settings → Secrets and variables → Actions）：

| Name | Value |
|---|---|
| `AI_API_KEY` | 任意 OpenAI 兼容服务的 Key（默认 DeepSeek） |

**Variables**（同一页面的 Variables 标签，可选）：

| Name | 默认 | 说明 |
|---|---|---|
| `AI_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容端点 |
| `AI_MODEL` | `deepseek-chat` | 模型名 |
| `AI_COMMENT` | 未设置 | 设为 `true` 才会**自动发评论**；不设只打标签 + 通知 |

> 不配置 `AI_API_KEY` 时，工作流自动跳过 AI 步骤，只做 Bark 通知，不会报错。

### 为什么默认不自动发评论

AI 回复可能不准确，默认只做「分类 + 打标签 + 通知」，由你自己决定是否回复。确认效果满意后再把 `AI_COMMENT` 设为 `true`。

## 想换成别的通知渠道

把 `.github/workflows/issue-notify.yml` 里的 `curl` 那一步换成对应服务即可：

| 渠道 | 方式 |
|---|---|
| 飞书 | `https://open.feishu.cn/open-apis/bot/v2/hook/xxx` |
| 钉钉 | `https://oapi.dingtalk.com/robot/send?access_token=xxx` |
| 企业微信 | `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx` |
| Server酱 | `https://sctapi.ftqq.com/<SendKey>.send` |
