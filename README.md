# gitmob-sync-worker

GitMob 收藏同步服务 — 基于 Cloudflare Workers + D1 + Durable Objects

为 [GitMob Android App](https://github.com/xiaobaiweinuli/GitMob-Android) 和浏览器插件提供收藏夹跨设备实时同步能力。

## 部署步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 D1 数据库

```bash
wrangler d1 create gitmob-sync-db
# 将输出的 database_id 填入 wrangler.toml 的 [[d1_databases]] 段
```

### 3. 初始化数据库表

```bash
npm run db:init
```

### 4. 部署

```bash
npm run deploy
```

### 5. 验证

部署完成后访问 Worker URL，应看到落地页并显示「服务状态：正常」。

也可通过 `/info` 接口验证：

```bash
curl https://your-worker.workers.dev/info
# {"type":"gitmob-sync","version":"1.0","features":["websocket","conflict_detection","sync_logs"]}
```

## 本地开发

```bash
# 初始化本地 D1
npm run db:init:preview

# 启动本地开发服务器
npm run dev
```

## 接口文档

| 方法   | 路径                         | 说明              | 认证 |
|--------|------------------------------|-------------------|------|
| GET    | `/`                          | 落地页            | ❌   |
| GET    | `/info`                      | 探测接口          | ❌   |
| GET    | `/health`                    | 健康检查          | ❌   |
| GET    | `/favorites/version`         | 轻量版本检查      | ✅   |
| GET    | `/favorites`                 | 拉取全量数据      | ✅   |
| POST   | `/favorites`                 | 全量覆盖写入      | ✅   |
| POST   | `/favorites/groups`          | 新增分组          | ✅   |
| PATCH  | `/favorites/groups/order`    | 更新分组排序      | ✅   |
| PATCH  | `/favorites/groups/:id`      | 修改分组          | ✅   |
| DELETE | `/favorites/groups/:id`      | 删除分组          | ✅   |
| POST   | `/favorites/repos`           | 新增/更新收藏     | ✅   |
| PATCH  | `/favorites/repos/order`     | 更新仓库排序      | ✅   |
| DELETE | `/favorites/repos/:fullName` | 移出收藏          | ✅   |
| GET    | `/ws`                        | WebSocket 连接    | ✅   |
| GET    | `/logs`                      | 同步日志          | ✅   |

所有需认证接口请求头：
```
Authorization: Bearer <github_pat>
X-Device-Id: <device_uuid>
```

## 隐私说明

- GitHub token 仅用于身份验证，验证后立即丢弃，**不存入数据库**
- D1 数据库按 GitHub login 严格隔离，用户只能访问自己的数据
- 数据库中存储的内容：分组名称、仓库 full_name 及元信息、排序信息
