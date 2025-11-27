/**
 * Глобальное хранилище WebSocket соединений по sessionId
 * Используется для отправки сообщений подписки на события конференции
 */

interface WebSocketConnection {
  ws: any;
  busId: string;
}

const wsConnections = new Map<string, WebSocketConnection>();

export function setWebSocketConnection(sessionId: string, connection: WebSocketConnection): void {
  wsConnections.set(sessionId, connection);
  console.log('[WS Storage] ✅ WebSocket connection stored for sessionId:', sessionId.substring(0, 20) + '...');
  console.log('[WS Storage] Total connections:', wsConnections.size);
  console.log('[WS Storage] WebSocket readyState:', connection.ws?.readyState);
}

export function getWebSocketConnection(sessionId: string): WebSocketConnection | undefined {
  const connection = wsConnections.get(sessionId);
  console.log('[WS Storage] 🔍 Looking for connection with sessionId:', sessionId.substring(0, 20) + '...');
  console.log('[WS Storage] Connection found:', !!connection);
  if (connection) {
    console.log('[WS Storage] WebSocket readyState:', connection.ws?.readyState);
  }
  return connection;
}

export function removeWebSocketConnection(sessionId: string): void {
  wsConnections.delete(sessionId);
  console.log('[WS Storage] WebSocket connection removed for sessionId:', sessionId.substring(0, 20) + '...');
}

export function getAllWebSocketConnections(): Map<string, WebSocketConnection> {
  return wsConnections;
}

