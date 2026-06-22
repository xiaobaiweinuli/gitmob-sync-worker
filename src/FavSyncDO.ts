/**
 * GitMob Sync Worker — Durable Object
 * 每个 user_id 对应一个 DO 实例（idFromName(userId)）
 * 身份验证已在 index.ts 的 handleWsUpgrade 里通过 ws_token 完成，
 * DO 收到的连接已确认属于该 userId，无需在 WS 消息层再次握手认证。
 */

import { DurableObject } from 'cloudflare:workers';
import { WsClientMessage } from './types.js';

export class FavSyncDO extends DurableObject {

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 内部广播接口（由 routes.ts 在写操作完成后调用，非公网 API）
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      try {
        const msg = await request.json() as object;
        this.broadcastToAll(msg);
      } catch { /* 忽略解析错误 */ }
      return new Response('ok');
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    const deviceId = url.searchParams.get('device_id') ?? 'unknown';

    // Hibernatable WebSockets：DO 可休眠，连接保持，仅活跃时计费
    this.ctx.acceptWebSocket(server);

    server.send(JSON.stringify({
      type:         'connected',
      online_count: this.ctx.getWebSockets().length,
    }));

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Hibernatable 事件处理器 ─────────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const msg = JSON.parse(message as string) as WsClientMessage;
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        return;
      }
      if (msg.type === 'fav_updated') {
        this.broadcastExcept(ws, msg);
      }
    } catch { /* 忽略非法消息，不关闭连接 */ }
  }

  async webSocketClose(ws: WebSocket): Promise<void> { ws.close(); }
  async webSocketError(_ws: WebSocket, _err: unknown): Promise<void> { }

  // ── 广播工具 ───────────────────────────────────────────────────────────
  // 同一 DO 实例只服务单一 userId，所有连接都属于同一用户的不同设备，
  // 无需按 userId 过滤，直接广播给该实例所有连接即可

  private broadcastToAll(data: object): void {
    const payload = JSON.stringify(data);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(payload); } catch { /* 连接已断，忽略 */ }
    }
  }

  private broadcastExcept(sender: WebSocket, data: object): void {
    const payload = JSON.stringify(data);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === sender) continue;
      try { ws.send(payload); } catch { /* 连接已断，忽略 */ }
    }
  }
}
