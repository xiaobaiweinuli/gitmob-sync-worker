/**
 * GitMob Sync Worker — 认证中间件
 * token → user_id（GitHub login），token 验证后立即丢弃，不落库
 */

import { ApiErr } from './types.js';

const GH_API = 'https://api.github.com/user';
const UA     = 'GitMob-Sync-Worker/1.0';

/**
 * 用 Bearer token 调 GitHub /user 拿到 login 作为 user_id。
 * 返回 null 表示 token 无效或请求失败。
 */
export async function authenticate(request: Request): Promise<string | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  try {
    const res = await fetch(GH_API, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': UA,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return null;
    const user = await res.json() as { login?: string };
    return user.login ?? null;
  } catch {
    return null;
  }
}

/**
 * 从请求头取 X-Device-Id，无则返回 'unknown'。
 */
export function getDeviceId(request: Request): string {
  return request.headers.get('X-Device-Id')?.trim() || 'unknown';
}

/**
 * 认证失败时返回 401 Response，通过后返回 null。
 */
export function unauthorized(): Response {
  return jsonErr('Unauthorized', 401);
}

export function rateLimited(): Response {
  return jsonErr('Rate limit exceeded', 429);
}

export function notFound(msg = 'Not found'): Response {
  return jsonErr(msg, 404);
}

export function badRequest(msg = 'Bad request'): Response {
  return jsonErr(msg, 400);
}

export function serverError(msg = 'Internal server error'): Response {
  return jsonErr(msg, 500);
}

function jsonErr(error: string, status: number): Response {
  const body: ApiErr = { ok: false, error };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// ─── CORS & 安全 headers ─────────────────────────────────────────────────────

export function corsHeaders(methods = 'GET, POST, PATCH, DELETE, OPTIONS') {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Device-Id',
  };
}

export function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options':        'DENY',
    'Referrer-Policy':        'no-referrer',
  };
}

export function jsonOk(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
      ...securityHeaders(),
    },
  });
}
