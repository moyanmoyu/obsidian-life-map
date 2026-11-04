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

## 想换成别的通知渠道

把 `.github/workflows/issue-notify.yml` 里的 `curl` 那一步换成对应服务即可：

| 渠道 | 方式 |
|---|---|
| 飞书 | `https://open.feishu.cn/open-apis/bot/v2/hook/xxx` |
| 钉钉 | `https://oapi.dingtalk.com/robot/send?access_token=xxx` |
| 企业微信 | `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx` |
| Server酱 | `https://sctapi.ftqq.com/<SendKey>.send` |
