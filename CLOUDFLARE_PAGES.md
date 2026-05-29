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
