/**
 * GitMob Sync Worker — 入口 & 路由分发
 *
 * 路由总表:
 *   GET    /                        → 落地页（服务状态 + 配置引导）
 *   GET    /info                    → 探测接口（无需认证）
 *   GET    /health                  → 轻量健康检查（无需认证）
 *   GET    /favorites/version       → 轻量版本向量检查
 *   GET    /favorites               → 拉取全量数据
 *   POST   /favorites               → 全量覆盖写入
 *   POST   /favorites/groups        → 新增分组
 *   PATCH  /favorites/groups/order  → 更新分组排序
 *   PATCH  /favorites/groups/:id    → 修改分组名/描述
 *   DELETE /favorites/groups/:id    → 删除分组
 *   POST   /favorites/repos         → 新增/更新收藏
 *   PATCH  /favorites/repos/order   → 更新组内仓库排序
 *   DELETE /favorites/repos/:fn     → 移出收藏（fn 需 URL 编码）
 *   GET    /ws                      → WebSocket 升级 → FavSyncDO
 *   GET    /logs                    → 拉取同步日志
 */

import { Env } from './types.js';
import { handleLanding, detectLang } from './landing.js';
import { authenticate, getDeviceId, jsonOk, corsHeaders, unauthorized } from './auth.js';
import {
  handleGetVersion,
  handleGetFavorites,
  handlePushFull,
  handleAddGroup,
  handleUpdateGroup,
  handleDeleteGroup,
  handleReorderGroups,
  handleUpsertRepo,
  handleDeleteRepo,
  handleReorderRepos,
  handleGetLogs,
  handleWsAuth,
} from './routes.js';

// 重新导出 DO class（wrangler 要求从 main 导出）
export { FavSyncDO } from './FavSyncDO.js';

// ─── 主路由 ──────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url    = new URL(request.url);
    const method = request.method.toUpperCase();
    const path   = url.pathname;

    // ── CORS 预检 ──────────────────────────────────────────────────────────
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders('GET, POST, PATCH, DELETE, OPTIONS'),
      });
    }

    // ── 静态 / 探测路由（无需认证）────────────────────────────────────────
    if (method === 'GET') {
      if (path === '/') {
        return handleLanding(request, url, env);
      }
      if (path === '/info') {
        return jsonOk({
          type:     'gitmob-sync',
          version:  env.WORKER_VERSION ?? '1.0',
          features: ['websocket', 'conflict_detection', 'sync_logs'],
        });
      }
      if (path === '/health') {
        return jsonOk({ ok: true, ts: Date.now() });
      }
    }

    // ── WebSocket 升级 ─────────────────────────────────────────────────────
    if (path === '/ws-auth' && method === 'POST') {
      return handleWsAuth(request, env);
    }

    if (method === 'GET' && path === '/ws') {
      return handleWsUpgrade(request, env);
    }

    // ── 收藏 API ───────────────────────────────────────────────────────────
    if (path === '/favorites/version' && method === 'GET') {
      return handleGetVersion(request, env);
    }
    if (path === '/favorites') {
      if (method === 'GET')  return handleGetFavorites(request, env);
      if (method === 'POST') return handlePushFull(request, env);
    }
    if (path === '/favorites/groups') {
      if (method === 'POST') return handleAddGroup(request, env);
    }
    if (path === '/favorites/groups/order' && method === 'PATCH') {
      return handleReorderGroups(request, env);
    }
    // PATCH/DELETE /favorites/groups/:id
    // 注意：必须在 /favorites/groups/order 之后匹配，避免把 "order" 当成 id
    const groupMatch = path.match(/^\/favorites\/groups\/([^/]+)$/);
    if (groupMatch) {
      const groupId = decodeURIComponent(groupMatch[1]);
      if (method === 'PATCH')  return handleUpdateGroup(request, env, groupId);
      if (method === 'DELETE') return handleDeleteGroup(request, env, groupId);
    }
    if (path === '/favorites/repos') {
      if (method === 'POST') return handleUpsertRepo(request, env);
    }
    if (path === '/favorites/repos/order' && method === 'PATCH') {
      return handleReorderRepos(request, env);
    }
    // DELETE /favorites/repos/:fullName（fullName 含 "/" 需 URL 编码为 %2F）
    const repoMatch = path.match(/^\/favorites\/repos\/(.+)$/);
    if (repoMatch && method === 'DELETE') {
      const fullName = decodeURIComponent(repoMatch[1]);
      return handleDeleteRepo(request, env, fullName);
    }
    if (path === '/logs' && method === 'GET') {
      return handleGetLogs(request, env);
    }

    // ── 404 ────────────────────────────────────────────────────────────────
    return jsonOk({ ok: false, error: 'Not found' }, 404);
  },
};

// ─── WebSocket 升级处理 ──────────────────────────────────────────────────────

async function handleWsUpgrade(request: Request, env: Env): Promise<Response> {
  const url     = new URL(request.url);
  const wsToken = url.searchParams.get('ws_token');
  const deviceId = url.searchParams.get('device_id') ?? getDeviceId(request);

  if (!wsToken) return unauthorized();

  // 查 D1 验证 ws_token，拿到 userId（一次性 token，验证后立即删除）
  const row = await env.DB.prepare(
    'SELECT user_id FROM ws_tokens WHERE token = ? AND expires_at > ?',
  ).bind(wsToken, Date.now()).first<{ user_id: string }>();

  if (!row) return unauthorized(); // token 不存在或已过期

  // 一次性消费：立即删除，防止重放
  await env.DB.prepare('DELETE FROM ws_tokens WHERE token = ?').bind(wsToken).run();

  const userId = row.user_id;

  // 路由到该用户专属的 DO 实例
  const doId = env.FAV_SYNC_DO.idFromName(userId);
  const stub = env.FAV_SYNC_DO.get(doId);

  const doUrl = new URL(request.url);
  doUrl.searchParams.set('user_id',   userId);
  doUrl.searchParams.set('device_id', deviceId);

  return stub.fetch(new Request(doUrl.toString(), request));
}
