import { DurableObject } from 'cloudflare:workers';
import { WsClientMessage } from './types.js';

export class FavSyncDO extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 内部广播接口（REST 写操作完成后由 routes.ts 调用）
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      try {
        const msg = await request.json() as object;
        this.broadcastToAll(msg);
      } catch { }
      return new Response('ok');
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();

    // Hibernatable WebSockets API：DO 可休眠，连接保持，不产生 Duration 费用
    this.ctx.acceptWebSocket(server);

    server.send(JSON.stringify({
      type:         'connected',
      online_count: this.ctx.getWebSockets().length,
    }));

    return new Response(null, { status: 101, webSocket: client });
  }

  // Hibernatable 事件处理器
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
    } catch { }
  }

  async webSocketClose(ws: WebSocket): Promise<void> { ws.close(); }
  async webSocketError(_ws: WebSocket, _err: unknown): Promise<void> { }

  private broadcastToAll(data: object): void {
    const payload = JSON.stringify(data);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(payload); } catch { }
    }
  }

  private broadcastExcept(sender: WebSocket, data: object): void {
    const payload = JSON.stringify(data);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === sender) continue;
      try { ws.send(payload); } catch { }
    }
  }
}
