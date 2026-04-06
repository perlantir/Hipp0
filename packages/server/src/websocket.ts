/**
 * WebSocket server — real-time event broadcasting for the DeciGraph dashboard.
 *
 * Usage:
 *   import { initWebSocket, broadcast } from './websocket.js';
 *   initWebSocket(httpServer);
 *   broadcast('decision_created', { id: '...' });
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

let wss: WebSocketServer | null = null;

export function initWebSocket(server: unknown): void {
  wss = new WebSocketServer({ server: server as Server, path: '/ws' });

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

  console.warn('[decigraph] WebSocket server ready on /ws');
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
