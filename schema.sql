-- GitMob Sync Worker — D1 数据库建表语句
-- 执行: wrangler d1 execute gitmob-sync-db --file=schema.sql
-- 本地预览: wrangler d1 execute gitmob-sync-db --local --file=schema.sql

-- ── 分组表 ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fav_groups (
  user_id     TEXT    NOT NULL,
  id          TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- ── 仓库表 ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fav_repos (
  user_id        TEXT    NOT NULL,
  full_name      TEXT    NOT NULL,
  github_id      INTEGER NOT NULL,
  name           TEXT    NOT NULL,
  owner_login    TEXT    NOT NULL,
  description    TEXT,
  language       TEXT,
  stars          INTEGER NOT NULL DEFAULT 0,
  forks          INTEGER NOT NULL DEFAULT 0,
  default_branch TEXT    NOT NULL DEFAULT 'main',
  is_private     INTEGER NOT NULL DEFAULT 0,
  archived       INTEGER NOT NULL DEFAULT 0,
  html_url       TEXT    NOT NULL,
  website        TEXT,
  topics         TEXT    NOT NULL DEFAULT '[]',
  group_id       TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (user_id, full_name),
  FOREIGN KEY (user_id, group_id)
    REFERENCES fav_groups(user_id, id)
    ON DELETE SET NULL
);

-- ── 同步版本表（向量时钟）────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_versions (
  user_id    TEXT    NOT NULL,
  device_id  TEXT    NOT NULL,
  version    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id)
);

-- ── 同步日志表（最新 200 条/用户，由 Worker 维护）────────────────────────────
CREATE TABLE IF NOT EXISTS sync_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL,
  device_id  TEXT    NOT NULL,
  action     TEXT    NOT NULL,
  detail     TEXT,
  created_at INTEGER NOT NULL
);

-- ── 限流计数表 ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit (
  key   TEXT    PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

-- ── 索引 ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_repos_user_group
  ON fav_repos(user_id, group_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_groups_user_order
  ON fav_groups(user_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_logs_user_time
  ON sync_logs(user_id, created_at DESC);
