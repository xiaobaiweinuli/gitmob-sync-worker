/**
 * GitMob Sync Worker — REST 路由处理
 * 所有写操作：认证 → 限流 → 执行 → 写日志 → 版本+1 → WS广播
 */

import { Env, GroupPayload, RepoPayload, LOG_ACTIONS } from './types.js';
import {
  authenticate, getDeviceId,
  unauthorized, rateLimited, notFound, badRequest, serverError, jsonOk,
} from './auth.js';
import { checkRateLimit } from './rateLimit.js';
import {
  getVersionVector, bumpVersion,
  getGroups, insertGroup, updateGroup, deleteGroup, reorderGroups,
  getRepos, upsertRepo, deleteRepo, reorderRepos,
  pushFull, writeLog, getLogs,
} from './db.js';

// ─── 工具：广播 WS 消息 ──────────────────────────────────────────────────────

async function broadcast(
  env: Env,
  userId: string,
  deviceId: string,
  changeType: string,
  newVector: Record<string, number>,
): Promise<void> {
  try {
    const doId = env.FAV_SYNC_DO.idFromName(userId);
    const stub = env.FAV_SYNC_DO.get(doId);
    // 必须包含 type: 'fav_updated'，SW 的 ws.onmessage 按此字段路由
    await stub.fetch('http://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type:               'fav_updated',   // ← 关键：SW onmessage 匹配此字段
        device_id:          deviceId,
        change_type:        changeType,
        new_version_vector: newVector,
      }),
    });
  } catch { /* 广播失败不影响主流程 */ }
}

// ─── 认证 + 限流 前置检查 ────────────────────────────────────────────────────

async function authAndLimit(
  request: Request,
  env: Env,
  needRateLimit: boolean,
): Promise<{ userId: string; deviceId: string } | Response> {
  const userId = await authenticate(request);
  if (!userId) return unauthorized();

  if (needRateLimit) {
    const ok = await checkRateLimit(env.DB, userId);
    if (!ok) return rateLimited();
  }

  return { userId, deviceId: getDeviceId(request) };
}

// ─── GET /favorites/version ──────────────────────────────────────────────────

export async function handleGetVersion(request: Request, env: Env): Promise<Response> {
  const auth = await authAndLimit(request, env, false);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  try {
    const vector = await getVersionVector(env.DB, userId);
    return jsonOk({ ok: true, version_vector: vector });
  } catch (e) {
    return serverError();
  }
}

// ─── GET /favorites ──────────────────────────────────────────────────────────

export async function handleGetFavorites(request: Request, env: Env): Promise<Response> {
  const auth = await authAndLimit(request, env, false);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  try {
    const [groups, repos, vector] = await Promise.all([
      getGroups(env.DB, userId),
      getRepos(env.DB, userId),
      getVersionVector(env.DB, userId),
    ]);

    // 将 D1 行转换为 API 响应格式（topics JSON 字符串 → 数组，is_private 0/1 → boolean）
    const groupsOut = groups.map(g => ({
      id:          g.id,
      name:        g.name,
      description: g.description,
      sort_order:  g.sort_order,
      updated_at:  g.updated_at,
    }));

    const reposOut = repos.map(r => ({
      full_name:      r.full_name,
      github_id:      r.github_id,
      name:           r.name,
      owner_login:    r.owner_login,
      description:    r.description,
      language:       r.language,
      stars:          r.stars,
      forks:          r.forks,
      default_branch: r.default_branch,
      is_private:     r.is_private === 1,
      archived:       r.archived === 1,
      html_url:       r.html_url,
      website:        r.website,
      topics:         safeParseTopics(r.topics),
      group_id:       r.group_id,
      sort_order:     r.sort_order,
      updated_at:     r.updated_at,
    }));

    return jsonOk({ ok: true, data: { version_vector: vector, groups: groupsOut, repos: reposOut } });
  } catch {
    return serverError();
  }
}

// ─── POST /favorites（全量覆盖写入）─────────────────────────────────────────

export async function handlePushFull(request: Request, env: Env): Promise<Response> {
  const auth = await authAndLimit(request, env, true);
  if (auth instanceof Response) return auth;
  const { userId, deviceId } = auth;

  let body: { groups?: GroupPayload[]; repos?: RepoPayload[] };
  try { body = await request.json() as typeof body; }
  catch { return badRequest('Invalid JSON'); }

  const groups = body.groups ?? [];
  const repos  = body.repos  ?? [];

  try {
    await pushFull(env.DB, userId, groups, repos);
    const vector = await bumpVersion(env.DB, userId, deviceId);
    await writeLog(env.DB, userId, deviceId, LOG_ACTIONS.FULL_PUSH, {
      groups: groups.length, repos: repos.length, source: 'api',
    });
    await broadcast(env, userId, deviceId, 'full_push', vector);
    return jsonOk({ ok: true, new_version_vector: vector });
  } catch {
    return serverError();
  }
}

// ─── POST /favorites/groups（新增分组）──────────────────────────────────────

export async function handleAddGroup(request: Request, env: Env): Promise<Response> {
  const auth = await authAndLimit(request, env, true);
  if (auth instanceof Response) return auth;
  const { userId, deviceId } = auth;

  let body: { group?: GroupPayload };
  try { body = await request.json() as typeof body; }
  catch { return badRequest('Invalid JSON'); }

  const g = body.group;
  if (!g?.id || !g.name) return badRequest('group.id and group.name are required');

  try {
    const result = await insertGroup(env.DB, userId, g);
    if (!result.ok) return badRequest(result.error ?? '新增分组失败');
    const vector = await bumpVersion(env.DB, userId, deviceId);
    await writeLog(env.DB, userId, deviceId, LOG_ACTIONS.ADD_GROUP, { name: g.name });
    await broadcast(env, userId, deviceId, 'add_group', vector);
    return jsonOk({ ok: true, new_version_vector: vector });
  } catch {
    return serverError();
  }
}

// ─── PATCH /favorites/groups/:id（修改分组名/描述）──────────────────────────

export async function handleUpdateGroup(
  request: Request,
  env: Env,
  groupId: string,
): Promise<Response> {
  const auth = await authAndLimit(request, env, true);
  if (auth instanceof Response) return auth;
  const { userId, deviceId } = auth;

  let body: { name?: string; description?: string };
  try { body = await request.json() as typeof body; }
  catch { return badRequest('Invalid JSON'); }

  if (body.name === undefined && body.description === undefined)
    return badRequest('name or description is required');

  try {
    const result = await updateGroup(env.DB, userId, groupId, body.name, body.description);
    if (!result.ok) return result.error?.includes('已存在') ? badRequest(result.error) : notFound('Group not found');
    const vector = await bumpVersion(env.DB, userId, deviceId);
    await writeLog(env.DB, userId, deviceId, LOG_ACTIONS.RENAME_GROUP, {
      group_id: groupId, name: body.name, description: body.description,
    });
    await broadcast(env, userId, deviceId, 'rename_group', vector);
    return jsonOk({ ok: true, new_version_vector: vector });
  } catch {
    return serverError();
  }
}

// ─── DELETE /favorites/groups/:id（删除分组）────────────────────────────────

export async function handleDeleteGroup(
  request: Request,
  env: Env,
  groupId: string,
): Promise<Response> {
  const auth = await authAndLimit(request, env, true);
  if (auth instanceof Response) return auth;
  const { userId, deviceId } = auth;

  const url  = new URL(request.url);
  const mode = url.searchParams.get('mode') === 'all' ? 'all' : 'group_only';

  try {
    const ok = await deleteGroup(env.DB, userId, groupId, mode);
    if (!ok) return notFound('Group not found');
    const vector = await bumpVersion(env.DB, userId, deviceId);
    await writeLog(env.DB, userId, deviceId, LOG_ACTIONS.DELETE_GROUP, { group_id: groupId, mode });
    await broadcast(env, userId, deviceId, 'delete_group', vector);
    return jsonOk({ ok: true, new_version_vector: vector });
  } catch {
    return serverError();
  }
}

// ─── PATCH /favorites/groups/order（更新分组排序）───────────────────────────

export async function handleReorderGroups(request: Request, env: Env): Promise<Response> {
  const auth = await authAndLimit(request, env, true);
  if (auth instanceof Response) return auth;
  const { userId, deviceId } = auth;

  let body: { order?: string[] };
  try { body = await request.json() as typeof body; }
  catch { return badRequest('Invalid JSON'); }

  if (!Array.isArray(body.order)) return badRequest('order must be an array of group IDs');

  try {
    await reorderGroups(env.DB, userId, body.order);
    const vector = await bumpVersion(env.DB, userId, deviceId);
    await writeLog(env.DB, userId, deviceId, LOG_ACTIONS.REORDER_GROUPS, { count: body.order.length });
    await broadcast(env, userId, deviceId, 'reorder_groups', vector);
    return jsonOk({ ok: true, new_version_vector: vector });
  } catch {
    return serverError();
  }
}

// ─── POST /favorites/repos（新增/更新收藏）──────────────────────────────────

export async function handleUpsertRepo(request: Request, env: Env): Promise<Response> {
  const auth = await authAndLimit(request, env, true);
  if (auth instanceof Response) return auth;
  const { userId, deviceId } = auth;

  let body: { repo?: RepoPayload };
  try { body = await request.json() as typeof body; }
  catch { return badRequest('Invalid JSON'); }

  const r = body.repo;
  if (!r?.full_name || !r.html_url || r.github_id === undefined)
    return badRequest('repo.full_name, repo.html_url, repo.github_id are required');

  try {
    await upsertRepo(env.DB, userId, r);
    const vector = await bumpVersion(env.DB, userId, deviceId);
    await writeLog(env.DB, userId, deviceId, LOG_ACTIONS.ADD_REPO, {
      full_name: r.full_name, group_id: r.group_id ?? null,
    });
    await broadcast(env, userId, deviceId, 'add_repo', vector);
    return jsonOk({ ok: true, new_version_vector: vector });
  } catch {
    return serverError();
  }
}

// ─── DELETE /favorites/repos/:fullName（移出收藏）───────────────────────────

export async function handleDeleteRepo(
  request: Request,
  env: Env,
  fullName: string,
): Promise<Response> {
  const auth = await authAndLimit(request, env, true);
  if (auth instanceof Response) return auth;
  const { userId, deviceId } = auth;

  try {
    const ok = await deleteRepo(env.DB, userId, fullName);
    if (!ok) return notFound('Repo not found in favorites');
    const vector = await bumpVersion(env.DB, userId, deviceId);
    await writeLog(env.DB, userId, deviceId, LOG_ACTIONS.REMOVE_REPO, { full_name: fullName });
    await broadcast(env, userId, deviceId, 'remove_repo', vector);
    return jsonOk({ ok: true, new_version_vector: vector });
  } catch {
    return serverError();
  }
}

// ─── PATCH /favorites/repos/order（更新组内仓库排序）────────────────────────

export async function handleReorderRepos(request: Request, env: Env): Promise<Response> {
  const auth = await authAndLimit(request, env, true);
  if (auth instanceof Response) return auth;
  const { userId, deviceId } = auth;

  let body: { group_id?: string | null; order?: string[] };
  try { body = await request.json() as typeof body; }
  catch { return badRequest('Invalid JSON'); }

  if (!Array.isArray(body.order)) return badRequest('order must be an array of full_names');

  const groupId = body.group_id === undefined ? null : (body.group_id ?? null);

  try {
    await reorderRepos(env.DB, userId, groupId, body.order);
    const vector = await bumpVersion(env.DB, userId, deviceId);
    await writeLog(env.DB, userId, deviceId, LOG_ACTIONS.REORDER_REPOS, {
      group_id: groupId, count: body.order.length,
    });
    await broadcast(env, userId, deviceId, 'reorder_repos', vector);
    return jsonOk({ ok: true, new_version_vector: vector });
  } catch {
    return serverError();
  }
}

// ─── POST /ws-auth（获取 WS 短生命周期 token，避免 PAT 出现在 WS URL）────────

export async function handleWsAuth(request: Request, env: Env): Promise<Response> {
  const auth = await authAndLimit(request, env, false);
  if (auth instanceof Response) return auth;
  const { userId, deviceId } = auth;

  // 清理过期 token
  await env.DB.prepare('DELETE FROM ws_tokens WHERE expires_at < ?')
    .bind(Date.now()).run();

  // 生成一次性 WS token，有效期 5 分钟
  const wsToken  = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  await env.DB.prepare(
    'INSERT INTO ws_tokens (token, user_id, device_id, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(wsToken, userId, deviceId, expiresAt).run();

  return jsonOk({ ok: true, ws_token: wsToken, user_id: userId });
}

export async function handleGetLogs(request: Request, env: Env): Promise<Response> {
  const auth = await authAndLimit(request, env, false);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  try {
    const logs = await getLogs(env.DB, userId, 100);
    const logsOut = logs.map(l => ({
      id:         l.id,
      device_id:  l.device_id,
      action:     l.action,
      detail:     l.detail ? safeParseJson(l.detail) : null,
      created_at: l.created_at,
    }));
    return jsonOk({ ok: true, logs: logsOut });
  } catch {
    return serverError();
  }
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function safeParseTopics(raw: string): string[] {
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; }
  catch { return []; }
}

function safeParseJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}
