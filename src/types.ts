/**
 * GitMob Sync Worker — 共享类型定义
 */

// ─── Worker Env ──────────────────────────────────────────────────────────────

export interface Env {
  DB: D1Database;
  FAV_SYNC_DO: DurableObjectNamespace;
  WORKER_VERSION: string;
}

// ─── D1 行类型 ───────────────────────────────────────────────────────────────

export interface DbGroup {
  user_id:     string;
  id:          string;
  name:        string;
  description: string;
  sort_order:  number;
  created_at:  number;
  updated_at:  number;
}

export interface DbRepo {
  user_id:        string;
  full_name:      string;
  github_id:      number;
  name:           string;
  owner_login:    string;
  description:    string | null;
  language:       string | null;
  stars:          number;
  forks:          number;
  default_branch: string;
  is_private:     number;   // 0 | 1
  archived:       number;   // 0 | 1
  html_url:       string;
  website:        string | null;
  topics:         string;   // JSON 数组字符串
  group_id:       string | null;
  sort_order:     number;
  created_at:     number;
  updated_at:     number;
}

export interface DbSyncVersion {
  user_id:    string;
  device_id:  string;
  version:    number;
  updated_at: number;
}

export interface DbSyncLog {
  id:         number;
  user_id:    string;
  device_id:  string;
  action:     string;
  detail:     string | null;
  created_at: number;
}

// ─── API 请求体类型 ──────────────────────────────────────────────────────────

export interface RepoPayload {
  full_name:      string;
  github_id:      number;
  name:           string;
  owner_login:    string;
  description?:   string | null;
  language?:      string | null;
  stars?:         number;
  forks?:         number;
  default_branch?: string;
  is_private?:    boolean;
  archived?:      boolean;
  html_url:       string;
  website?:       string | null;
  topics?:        string[];
  group_id?:      string | null;
  sort_order:     number;
  created_at?:    number;
  updated_at?:    number;
}

export interface GroupPayload {
  id:           string;
  name:         string;
  description?: string;
  sort_order:   number;
  created_at?:  number;
  updated_at?:  number;
}

// ─── API 响应类型 ────────────────────────────────────────────────────────────

export type VersionVector = Record<string, number>;

export interface ApiOk {
  ok: true;
  new_version_vector?: VersionVector;
  [key: string]: unknown;
}

export interface ApiErr {
  ok: false;
  error: string;
}

// ─── WebSocket 消息类型 ──────────────────────────────────────────────────────

export type WsChangeType =
  | 'add_repo'
  | 'remove_repo'
  | 'move_repo'
  | 'add_group'
  | 'delete_group'
  | 'rename_group'
  | 'reorder_groups'
  | 'reorder_repos'
  | 'full_push';

export interface WsFavUpdated {
  type: 'fav_updated';
  device_id: string;
  change_type: WsChangeType;
  new_version_vector: VersionVector;
}

export interface WsPing { type: 'ping' }

export type WsClientMessage = WsFavUpdated | WsPing;

// ─── 日志 action 常量 ────────────────────────────────────────────────────────

export const LOG_ACTIONS = {
  ADD_REPO:          'add_repo',
  REMOVE_REPO:       'remove_repo',
  MOVE_REPO:         'move_repo',
  ADD_GROUP:         'add_group',
  RENAME_GROUP:      'rename_group',
  DELETE_GROUP:      'delete_group',
  REORDER_GROUPS:    'reorder_groups',
  REORDER_REPOS:     'reorder_repos',
  FULL_PUSH:         'full_push',
  FULL_PULL:         'full_pull',
  CONFLICT_RESOLVED: 'conflict_resolved',
} as const;
