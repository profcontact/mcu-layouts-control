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
}

export function getWebSocketConnection(sessionId: string): WebSocketConnection | undefined {
  return wsConnections.get(sessionId);
}

export function removeWebSocketConnection(sessionId: string): void {
  wsConnections.delete(sessionId);
}

export function getAllWebSocketConnections(): Map<string, WebSocketConnection> {
  return wsConnections;
}

