/**
 * GitMob Sync Worker — 基于 D1 的写操作限流
 * 不消耗 KV 配额，用 rate_limit 表存分钟级计数
 */

/**
 * 检查并递增限流计数。
 * @returns true = 允许通过，false = 已超限
 */
export async function checkRateLimit(
  db: D1Database,
  userId: string,
  limitPerMinute = 120,
): Promise<boolean> {
  const window = Math.floor(Date.now() / 60_000);
  const key    = `${userId}:${window}`;

  try {
    const row = await db
      .prepare('SELECT count FROM rate_limit WHERE key = ?')
      .bind(key)
      .first<{ count: number }>();

    if (row) {
      if (row.count >= limitPerMinute) return false;
      await db
        .prepare('UPDATE rate_limit SET count = count + 1 WHERE key = ?')
        .bind(key)
        .run();
    } else {
      // 清理本用户 2 分钟前的旧记录，再插入新记录
      await db
        .prepare("DELETE FROM rate_limit WHERE key LIKE ? AND key < ?")
        .bind(`${userId}:%`, `${userId}:${window - 2}`)
        .run();
      await db
        .prepare('INSERT INTO rate_limit (key, count) VALUES (?, 1)')
        .bind(key)
        .run();
    }
    return true;
  } catch {
    // D1 故障时放行（不因限流表故障阻断正常请求）
    return true;
  }
}
