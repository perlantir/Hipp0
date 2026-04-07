/**
 * WebSocket server — real-time event broadcasting for the DeciGraph dashboard.
 *
 * Usage:
 *   import { initWebSocket, broadcast } from './websocket.js';
 *   initWebSocket(httpServer);
 *   broadcast('decision_created', { id: '...' });
 */

import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

let wss: WebSocketServer | null = null;

/** Return the WebSocketServer instance (call after initWebSocket). */
export function getMainWss(): WebSocketServer | null {
  return wss;
}

export function initWebSocket(): void {
  // noServer mode — the HTTP upgrade event is handled in index.ts
  wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws) => {
    const connectionId = randomUUID();

    // Send welcome message
    ws.send(JSON.stringify({
      event: 'connected',
      data: { connection_id: connectionId, timestamp: new Date().toISOString() },
    }));

    ws.on('error', (err) => {
      console.warn('[decigraph/ws] Client error:', err.message);
    });

    ws.on('close', () => {
      // Client disconnected — nothing to clean up
    });
  });

  console.warn('[decigraph] WebSocket server ready on /ws (noServer mode)');
}

export function broadcast(event: string, data: unknown): void {
  if (!wss) return;

  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
