# Cloudflare Pages 部署说明

项目已配置为 Nuxt + Nitro 的 `cloudflare_pages` 目标。

## Pages 配置

- Framework preset: `Nuxt`
- Production branch: `master`
- Build command: `npm run build:pages`
- Build output directory: `dist`

## Node 版本

建议在 Cloudflare Pages 的环境变量里设置：

- `NODE_VERSION=20`

同时在 Cloudflare Pages 项目设置中打开：

- `Node.js compatibility`

## 首次部署

1. 在 Cloudflare Pages 中选择 `Connect to Git`
2. 连接 GitHub 仓库 `eldermass/t-king`
3. 按上面的构建参数填写
4. 点击 `Save and Deploy`

## 说明

- 服务端接口会跟随 Nuxt 一起部署到 Cloudflare Pages Functions
- 行情和个股资料接口仍然实时请求东方财富公开接口

## 企业微信后台提醒

页面站点仍然部署在 Cloudflare Pages，但“页面没打开也能提醒”需要额外部署一个 Cloudflare Worker 定时任务。

### 1. 配置 Worker 环境变量

在 Cloudflare Workers 里为 `t-king-wecom-notifier` 配置：

- `WECOM_CORP_ID`
- `WECOM_AGENT_ID`
- `WECOM_SECRET`
- `WECOM_USER_ID`

### 2. 部署 Worker

使用仓库里的独立配置文件：

```bash
npx wrangler deploy --config wrangler.wecom.toml
```

### 3. 定时规则

- Worker 每 5 分钟运行一次
- 仅周一到周五执行
- Worker 内部只在北京时间 `09:30-11:30`、`13:00-15:00` 发送提醒
- 某条提醒触发后会每 5 分钟持续推送，直到你完成操作或价格不再满足条件
