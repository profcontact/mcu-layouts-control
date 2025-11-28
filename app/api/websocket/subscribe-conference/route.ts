import { NextRequest, NextResponse } from 'next/server';
import { getAuthHeaders } from '../../_helpers/auth';
import { getWebSocketConnection, getAllWebSocketConnections } from '../_ws-storage';

/**
 * API Route для подписки на события конференции через WebSocket
 * Отправляет сообщение подписки через существующее WebSocket соединение
 */
export async function POST(request: NextRequest) {
  try {
    // Пробуем получить sessionId из разных источников
    const authHeaders = getAuthHeaders(request);
    const sessionIdFromHeaders = authHeaders['Session'] || authHeaders['session'];
    const sessionIdFromQuery = request.nextUrl.searchParams.get('session');
    const sessionId = sessionIdFromHeaders || sessionIdFromQuery;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required. Provide it in Session header or ?session query parameter.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { conferenceSessionId } = body;

    if (!conferenceSessionId) {
      return NextResponse.json(
        { error: 'conferenceSessionId is required' },
        { status: 400 }
      );
    }

    // Получаем WebSocket соединение для данного sessionId
    const wsConnection = getWebSocketConnection(sessionId);
    
    if (!wsConnection || !wsConnection.ws) {
      return NextResponse.json(
        { 
          error: 'WebSocket connection not found. Please ensure Event Channel is connected.',
          debug: {
            sessionIdProvided: sessionId ? sessionId.substring(0, 20) + '...' : 'missing',
            totalConnections: getAllWebSocketConnections().size,
          }
        },
        { status: 503 }
      );
    }

    const { ws } = wsConnection;

    // Проверяем, что WebSocket соединение открыто
    if (ws.readyState !== 1) { // WebSocket.OPEN
      return NextResponse.json(
        { error: 'WebSocket connection is not open' },
        { status: 503 }
      );
    }

    // Отправляем сообщения подписки на события конференции
    // Согласно OpenAPI спецификации, нужно подписаться на:
    // - /websocket/chatActiveConferenceEvents
    // - /websocket/commonActiveConferenceEvents  
    // - /websocket/participantActiveConferenceEvents
    
    // Формат сообщения подписки может варьироваться в зависимости от реализации API
    // Обычно это JSON сообщение с указанием типа подписки и conferenceSessionId
    const subscriptionMessages = [
      {
        type: 'subscribe',
        endpoint: '/websocket/chatActiveConferenceEvents',
        conferenceSessionId: conferenceSessionId,
      },
      {
        type: 'subscribe',
        endpoint: '/websocket/commonActiveConferenceEvents',
        conferenceSessionId: conferenceSessionId,
      },
      {
        type: 'subscribe',
        endpoint: '/websocket/participantActiveConferenceEvents',
        conferenceSessionId: conferenceSessionId,
      },
    ];

    try {
      // Отправляем сообщения подписки
      for (const message of subscriptionMessages) {
        ws.send(JSON.stringify(message));
        // Логируем событие подписки
        console.log('[Subscribe Conference] 📤 Sent subscription message:', message.endpoint);
      }

      return NextResponse.json({ 
        success: true,
        message: 'Successfully subscribed to conference events',
        subscriptions: subscriptionMessages.map(m => m.endpoint),
      });
    } catch (sendError: any) {
      console.error('[Subscribe Conference] Error sending subscription messages:', sendError);
      return NextResponse.json(
        { error: `Failed to send subscription messages: ${sendError.message}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[Subscribe Conference] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to subscribe to conference events' },
      { status: 500 }
    );
  }
}

