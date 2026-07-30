# 德州扑克 nodejs 版本

居家隔离，线上好友交流用。  
PC 界面，利于操作。可本地化部署，无需持久化存储。

## 运行

```
npm i
npm run build
pm2 start dist/src/server/app-server.js
```

## 开发

```
npm i
npm run start:web		# start react app
npm run watch-server	# start server
```

## 说明

核心算法：`src/server/utils/game-engine.ts`

## 部署到 Cloudflare

Cloudflare 版本使用以下结构：

- React 静态文件由 Workers Static Assets 提供；
- HTTP API 和 WebSocket 由 Worker 处理；
- 所有房间集中在一个 Durable Object 中，以保持和原单 Node.js 进程相同的内存状态模型；
- `codecrab.dev` 和 `www.codecrab.dev` 会作为 Worker Custom Domains 自动配置。

### 首次配置

要求 Node.js 20 或更高版本。先安装依赖并登录 Cloudflare：

```bash
npm ci --legacy-peer-deps --no-audit --no-fund
npx wrangler login
JWT_SECRET="$(openssl rand -hex 32)" npm run setup:cloudflare
```

`JWT_SECRET` 只应初始化一次。以后修改它会让用户浏览器中已有的登录令牌失效。

如果在 CI 中部署，不运行 `wrangler login`，改为设置：

```bash
export CLOUDFLARE_ACCOUNT_ID="Cloudflare Account ID"
export CLOUDFLARE_API_TOKEN="Cloudflare API Token"
export JWT_SECRET="一个长期稳定的随机字符串"
npm run setup:cloudflare
```

API Token 可使用 Cloudflare 的 **Edit Cloudflare Workers** 模板，并把 Account 和 Zone 资源限制到实际使用的账户及 `codecrab.dev`。

### 部署

```bash
npm run deploy:cloudflare
```

脚本会构建前端，然后部署名为 `codecrab-poker` 的 Worker、静态资源、Durable Object 和两个 Custom Domains。域名必须已经是当前 Cloudflare 账户中的 Active Zone，并且 `codecrab.dev` / `www.codecrab.dev` 不能存在冲突的 CNAME 记录。

本地 Cloudflare 运行时调试：

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，填入本地 JWT_SECRET
npm run dev:cloudflare
```

只验证构建和 Worker 打包，不发布：

```bash
./deploy/deploy-cloudflare.sh dry-run
```

### 状态说明

该项目原本不持久化牌局，Cloudflare 版本保持这一特性。房间在仍有 WebSocket 客户端连接时由 Durable Object 保持；当实例被回收或重新部署后，内存中的房间会消失。若要跨部署保存牌局，需要进一步把房间状态写入 Durable Object SQLite 存储。
