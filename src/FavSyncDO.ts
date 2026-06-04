/**
 * GitMob Sync Worker — Durable Object
 * 每个 user_id 对应一个 DO 实例，管理该用户所有在线 WebSocket 连接并广播消息
 */

import { WsClientMessage } from './types.js';

interface Session {
  ws:       WebSocket;
  deviceId: string;
}

export class FavSyncDO implements DurableObject {
  private sessions = new Map<string, Session>();

  async fetch(request: Request): Promise<Response> {
    const url      = new URL(request.url);
    const deviceId = url.searchParams.get('device_id') ?? 'unknown';

    // 内部广播接口（由 routes.ts 调用，不对外暴露）
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      try {
        const msg = await request.json() as object;
        this.broadcast('__internal__', msg);
      } catch { /* 忽略 */ }
      return new Response('ok');
    }

    // 仅接受 WebSocket 升级请求（来自 index.ts 转发，user_id 已验证）
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();

    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, { ws: server, deviceId });

    // 连接建立后推送确认消息
    this.sendSafe(server, {
      type:         'connected',
      session_id:   sessionId,
      online_count: this.sessions.size,
    });

    server.addEventListener('message', (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string) as WsClientMessage;
        if (msg.type === 'ping') {
          this.sendSafe(server, { type: 'pong', ts: Date.now() });
          return;
        }
        if (msg.type === 'fav_updated') {
          // 广播给同用户其他所有连接，排除发送方
          this.broadcast(sessionId, msg);
        }
      } catch { /* 忽略非法消息，不关闭连接 */ }
    });

    server.addEventListener('close', () => {
      this.sessions.delete(sessionId);
    });

    server.addEventListener('error', () => {
      this.sessions.delete(sessionId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  /** 向单个连接发送消息，失败时清理该连接 */
  private sendSafe(ws: WebSocket, data: object): void {
    try {
      ws.send(JSON.stringify(data));
    } catch { /* 忽略发送失败 */ }
  }

  /** 广播给除 excludeSessionId 之外的所有连接 */
  private broadcast(excludeSessionId: string, data: object): void {
    const payload = JSON.stringify(data);
    for (const [id, session] of this.sessions) {
      if (id === excludeSessionId) continue;
      try {
        session.ws.send(payload);
      } catch {
        // 连接已断但未触发 close 事件，主动清理
        this.sessions.delete(id);
      }
    }
  }
}
