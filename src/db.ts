/**
 * GitMob Sync Worker — D1 CRUD 封装
 * 所有操作强制带 user_id，禁止跨用户访问
 */

import {
  DbGroup, DbRepo, DbSyncVersion, DbSyncLog,
  GroupPayload, RepoPayload, VersionVector,
} from './types.js';

const NOW = () => Date.now();

// ─── 版本向量 ────────────────────────────────────────────────────────────────

/** 获取该用户所有设备的版本向量 */
export async function getVersionVector(
  db: D1Database,
  userId: string,
): Promise<VersionVector> {
  const rows = await db
    .prepare('SELECT device_id, version FROM sync_versions WHERE user_id = ?')
    .bind(userId)
    .all<{ device_id: string; version: number }>();
  const vec: VersionVector = {};
  for (const r of rows.results ?? []) vec[r.device_id] = r.version;
  return vec;
}

/** 将指定设备的版本号 +1 并返回最新向量 */
export async function bumpVersion(
  db: D1Database,
  userId: string,
  deviceId: string,
): Promise<VersionVector> {
  const now = NOW();
  await db.prepare(`
    INSERT INTO sync_versions (user_id, device_id, version, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT (user_id, device_id)
    DO UPDATE SET version = version + 1, updated_at = excluded.updated_at
  `).bind(userId, deviceId, now).run();
  return getVersionVector(db, userId);
}

// ─── 分组 CRUD ───────────────────────────────────────────────────────────────

export async function getGroups(
  db: D1Database,
  userId: string,
): Promise<DbGroup[]> {
  const r = await db
    .prepare('SELECT * FROM fav_groups WHERE user_id = ? ORDER BY sort_order ASC')
    .bind(userId)
    .all<DbGroup>();
  return r.results ?? [];
}

export async function insertGroup(
  db: D1Database,
  userId: string,
  g: GroupPayload,
): Promise<void> {
  const now = NOW();
  await db.prepare(`
    INSERT INTO fav_groups (user_id, id, name, description, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, id)
    DO UPDATE SET name = excluded.name, description = excluded.description,
                  sort_order = excluded.sort_order, updated_at = excluded.updated_at
  `).bind(
    userId, g.id, g.name, g.description ?? '',
    g.sort_order, g.created_at ?? now, g.updated_at ?? now,
  ).run();
}

export async function updateGroup(
  db: D1Database,
  userId: string,
  groupId: string,
  name?: string,
  description?: string,
): Promise<boolean> {
  // 先确认分组存在
  const existing = await db
    .prepare('SELECT id FROM fav_groups WHERE user_id = ? AND id = ?')
    .bind(userId, groupId)
    .first<{ id: string }>();
  if (!existing) return false;

  const parts: string[] = ['updated_at = ?'];
  const binds: unknown[] = [NOW()];
  if (name !== undefined)        { parts.push('name = ?');        binds.push(name); }
  if (description !== undefined) { parts.push('description = ?'); binds.push(description); }

  binds.push(userId, groupId);
  await db
    .prepare(`UPDATE fav_groups SET ${parts.join(', ')} WHERE user_id = ? AND id = ?`)
    .bind(...binds)
    .run();
  return true;
}

/**
 * 删除分组
 * mode = 'group_only'：分组内仓库的 group_id 置为 NULL（移至未分组）
 * mode = 'all'：连同组内所有仓库一起删除
 */
export async function deleteGroup(
  db: D1Database,
  userId: string,
  groupId: string,
  mode: 'group_only' | 'all',
): Promise<boolean> {
  const existing = await db
    .prepare('SELECT id FROM fav_groups WHERE user_id = ? AND id = ?')
    .bind(userId, groupId)
    .first<{ id: string }>();
  if (!existing) return false;

  if (mode === 'all') {
    await db
      .prepare('DELETE FROM fav_repos WHERE user_id = ? AND group_id = ?')
      .bind(userId, groupId)
      .run();
  } else {
    // 组内仓库移至未分组，sort_order 追加到未分组末尾
    const maxOrder = await db
      .prepare('SELECT MAX(sort_order) as m FROM fav_repos WHERE user_id = ? AND group_id IS NULL')
      .bind(userId)
      .first<{ m: number | null }>();
    let offset = (maxOrder?.m ?? -1) + 1;
    const members = await db
      .prepare('SELECT full_name FROM fav_repos WHERE user_id = ? AND group_id = ? ORDER BY sort_order ASC')
      .bind(userId, groupId)
      .all<{ full_name: string }>();
    for (const row of members.results ?? []) {
      await db
        .prepare('UPDATE fav_repos SET group_id = NULL, sort_order = ?, updated_at = ? WHERE user_id = ? AND full_name = ?')
        .bind(offset++, NOW(), userId, row.full_name)
        .run();
    }
  }

  await db
    .prepare('DELETE FROM fav_groups WHERE user_id = ? AND id = ?')
    .bind(userId, groupId)
    .run();
  return true;
}

/** 批量更新分组排序：按 order 数组中的位置赋 sort_order */
export async function reorderGroups(
  db: D1Database,
  userId: string,
  order: string[],
): Promise<void> {
  const now = NOW();
  const stmts = order.map((id, i) =>
    db.prepare('UPDATE fav_groups SET sort_order = ?, updated_at = ? WHERE user_id = ? AND id = ?')
      .bind(i, now, userId, id)
  );
  if (stmts.length > 0) await db.batch(stmts);
}

// ─── 仓库 CRUD ───────────────────────────────────────────────────────────────

export async function getRepos(
  db: D1Database,
  userId: string,
): Promise<DbRepo[]> {
  const r = await db
    .prepare('SELECT * FROM fav_repos WHERE user_id = ? ORDER BY group_id ASC, sort_order ASC')
    .bind(userId)
    .all<DbRepo>();
  return r.results ?? [];
}

export async function upsertRepo(
  db: D1Database,
  userId: string,
  repo: RepoPayload,
): Promise<void> {
  const now = NOW();
  await db.prepare(`
    INSERT INTO fav_repos (
      user_id, full_name, github_id, name, owner_login, description,
      language, stars, forks, default_branch, is_private, archived,
      html_url, website, topics, group_id, sort_order, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT (user_id, full_name)
    DO UPDATE SET
      github_id      = excluded.github_id,
      name           = excluded.name,
      owner_login    = excluded.owner_login,
      description    = excluded.description,
      language       = excluded.language,
      stars          = excluded.stars,
      forks          = excluded.forks,
      default_branch = excluded.default_branch,
      is_private     = excluded.is_private,
      archived       = excluded.archived,
      html_url       = excluded.html_url,
      website        = excluded.website,
      topics         = excluded.topics,
      group_id       = excluded.group_id,
      sort_order     = excluded.sort_order,
      updated_at     = excluded.updated_at
  `).bind(
    userId,
    repo.full_name,
    repo.github_id,
    repo.name,
    repo.owner_login,
    repo.description ?? null,
    repo.language ?? null,
    repo.stars ?? 0,
    repo.forks ?? 0,
    repo.default_branch ?? 'main',
    repo.is_private ? 1 : 0,
    repo.archived ? 1 : 0,
    repo.html_url,
    repo.website ?? null,
    JSON.stringify(repo.topics ?? []),
    repo.group_id ?? null,
    repo.sort_order,
    repo.created_at ?? now,
    repo.updated_at ?? now,
  ).run();
}

export async function deleteRepo(
  db: D1Database,
  userId: string,
  fullName: string,
): Promise<boolean> {
  const r = await db
    .prepare('DELETE FROM fav_repos WHERE user_id = ? AND full_name = ?')
    .bind(userId, fullName)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}

/** 批量更新组内仓库排序 */
export async function reorderRepos(
  db: D1Database,
  userId: string,
  groupId: string | null,
  order: string[],
): Promise<void> {
  const now = NOW();
  const stmts = order.map((fullName, i) =>
    db.prepare(`
      UPDATE fav_repos SET sort_order = ?, updated_at = ?
      WHERE user_id = ? AND full_name = ?
        AND (group_id ${groupId === null ? 'IS NULL' : '= ?'})
    `).bind(...(groupId === null
      ? [i, now, userId, fullName]
      : [i, now, userId, fullName, groupId]
    ))
  );
  if (stmts.length > 0) await db.batch(stmts);
}

// ─── 全量覆盖写入（导入联动）────────────────────────────────────────────────

/**
 * 在单个事务内：删除该用户所有分组和仓库数据，再批量插入新数据。
 * D1 batch() 保证原子性。
 */
export async function pushFull(
  db: D1Database,
  userId: string,
  groups: GroupPayload[],
  repos: RepoPayload[],
): Promise<void> {
  const now = NOW();
  const stmts: D1PreparedStatement[] = [];

  // 删除现有数据
  stmts.push(
    db.prepare('DELETE FROM fav_repos   WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM fav_groups  WHERE user_id = ?').bind(userId),
  );

  // 插入分组
  for (const g of groups) {
    stmts.push(db.prepare(`
      INSERT INTO fav_groups (user_id, id, name, description, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(userId, g.id, g.name, g.description ?? '', g.sort_order, g.created_at ?? now, g.updated_at ?? now));
  }

  // 插入仓库
  for (const r of repos) {
    stmts.push(db.prepare(`
      INSERT INTO fav_repos (
        user_id, full_name, github_id, name, owner_login, description,
        language, stars, forks, default_branch, is_private, archived,
        html_url, website, topics, group_id, sort_order, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      userId, r.full_name, r.github_id, r.name, r.owner_login,
      r.description ?? null, r.language ?? null,
      r.stars ?? 0, r.forks ?? 0, r.default_branch ?? 'main',
      r.is_private ? 1 : 0, r.archived ? 1 : 0,
      r.html_url, r.website ?? null,
      JSON.stringify(r.topics ?? []),
      r.group_id ?? null, r.sort_order,
      r.created_at ?? now, r.updated_at ?? now,
    ));
  }

  await db.batch(stmts);
}

// ─── 同步日志 ────────────────────────────────────────────────────────────────

export async function writeLog(
  db: D1Database,
  userId: string,
  deviceId: string,
  action: string,
  detail?: object,
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO sync_logs (user_id, device_id, action, detail, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      userId, deviceId, action,
      detail ? JSON.stringify(detail) : null,
      Date.now(),
    ).run();

    // 保留最新 200 条
    await db.prepare(`
      DELETE FROM sync_logs
      WHERE user_id = ? AND id NOT IN (
        SELECT id FROM sync_logs WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 200
      )
    `).bind(userId, userId).run();
  } catch { /* 日志写入失败不影响主流程 */ }
}

export async function getLogs(
  db: D1Database,
  userId: string,
  limit = 100,
): Promise<DbSyncLog[]> {
  const r = await db
    .prepare('SELECT * FROM sync_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(userId, limit)
    .all<DbSyncLog>();
  return r.results ?? [];
}
