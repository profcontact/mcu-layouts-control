import { NextRequest } from 'next/server';
import { getAuthHeaders } from '../../_helpers/auth';
import { setWebSocketConnection, removeWebSocketConnection } from '../_ws-storage';

const API_BASE_URL = process.env.API_URL || 'https://ivcs.profcontact.by/api/rest';
const WS_HOST = 'ivcs.profcontact.by';

/**
 * API Route для проксирования WebSocket Event Channel через Server-Sent Events (SSE)
 * На сервере устанавливается WebSocket соединение с внешним API,
 * а клиент получает события через SSE
 */
export async function GET(request: NextRequest) {
  console.log('[Server WebSocket] 📥 Event Channel request received');
  console.log('[Server WebSocket] Request URL:', request.url);
  console.log('[Server WebSocket] Request method:', request.method);
  
  // EventSource не поддерживает кастомные заголовки, поэтому получаем Session ID из query параметра
  // Также пробуем получить из заголовков на случай если используется другой клиент
  const sessionIdFromQuery = request.nextUrl.searchParams.get('session');
  const authHeaders = getAuthHeaders(request);
  const sessionId = sessionIdFromQuery || authHeaders['Session'] || authHeaders['session'];
  
  console.log('[Server WebSocket] SessionId from query:', sessionIdFromQuery ? sessionIdFromQuery.substring(0, 20) + '...' : 'MISSING');
  console.log('[Server WebSocket] SessionId from headers:', authHeaders['Session'] ? authHeaders['Session'].substring(0, 20) + '...' : 'MISSING');
  console.log('[Server WebSocket] Final sessionId:', sessionId ? sessionId.substring(0, 20) + '...' : 'MISSING');
  
  if (!sessionId) {
    console.error('[Server WebSocket] ❌ No sessionId provided');
    return new Response(
      JSON.stringify({ error: 'Session ID is required. Provide it as query parameter: ?session=YOUR_SESSION_ID' }),
      { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  console.log('[Server WebSocket] ✅ Starting Event Channel with sessionId:', sessionId.substring(0, 20) + '...');

  // Создаем ReadableStream для SSE
  const encoder = new TextEncoder();
  let ws: any = null;
  let pingInterval: NodeJS.Timeout | null = null;
  let connectionTimeout: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Генерируем busId
        const busId = crypto.randomUUID();
        console.log('[Server WebSocket] Bus ID:', busId);
        const wsUrl = `wss://${WS_HOST}/websocket/eventbus/${busId}/json/source/VIDEOCONFERENCE?Session=${encodeURIComponent(sessionId)}`;
        
        console.log('[Server WebSocket] Connecting to:', wsUrl.replace(sessionId, 'SESSION_ID_HIDDEN'));
        
        // Используем динамический импорт для ws (если установлен) или встроенный WebSocket
        let WebSocketClass: any;
        
        try {
          // Пробуем использовать библиотеку 'ws' для Node.js
          const wsModule = await import('ws');
          WebSocketClass = wsModule.default;
        } catch {
          // Если 'ws' не установлена, используем встроенный WebSocket (Node.js 18+)
          WebSocketClass = globalThis.WebSocket;
        }

        if (!WebSocketClass) {
          throw new Error('WebSocket is not available. Please install "ws" package: npm install ws');
        }

        // Создаем WebSocket соединение на сервере
        // Для библиотеки 'ws' заголовки передаются через опции
        // Для встроенного WebSocket (Node.js 18+) заголовки передаются через опции headers
        const wsOptions: any = {
          headers: {
            'Session': sessionId,
          },
        };
        
        // Если используется библиотека 'ws', она поддерживает заголовки напрямую
        ws = new WebSocketClass(wsUrl, wsOptions);
        
        console.log('[Server WebSocket] WebSocket instance created');
        console.log('[Server WebSocket] WebSocket URL:', wsUrl.replace(sessionId, 'SESSION_ID_HIDDEN'));
        
        // Устанавливаем таймаут для подключения (10 секунд)
        connectionTimeout = setTimeout(() => {
          if (ws && ws.readyState !== 1) { // WebSocket.OPEN
            console.error('[Server WebSocket] ⏱️ Connection timeout after 10 seconds');
            ws.close();
            sendSSE({ 
              type: 'error', 
              error: 'WebSocket connection timeout. Please check your network connection and try again.' 
            });
            controller.close();
          }
        }, 10000);
        
        // Отправляем начальное сообщение клиенту через SSE
        const sendSSE = (data: any) => {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        sendSSE({ type: 'connecting', message: 'Connecting to Event Channel...' });

        ws.on('open', () => {
          // Очищаем таймаут при успешном подключении
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
          }
          console.log('[Server WebSocket] ✅ Connected to Event Channel');
          console.log('[Server WebSocket] SessionId:', sessionId.substring(0, 20) + '...');
          console.log('[Server WebSocket] BusId:', busId);
          console.log('[Server WebSocket] WebSocket readyState:', ws.readyState);
          
          // Сохраняем WebSocket соединение для возможности отправки сообщений подписки
          // Проверяем, что соединение действительно открыто
          if (ws.readyState === 1) { // WebSocket.OPEN
            setWebSocketConnection(sessionId, { ws, busId });
            console.log('[Server WebSocket] ✅ WebSocket connection stored successfully');
          } else {
            console.warn('[Server WebSocket] ⚠️ WebSocket not in OPEN state, not storing:', ws.readyState);
          }
          
          // Отправляем busId клиенту при подключении
          sendSSE({ type: 'connected', message: 'Connected to Event Channel', busId: busId });

          // Начинаем отправлять ping каждые 25 секунд
          pingInterval = setInterval(() => {
            if (ws && ws.readyState === 1) { // WebSocket.OPEN
              const pingNumber = Date.now();
              ws.send(`ping-${pingNumber}`);
              console.log('[Server WebSocket] 📤 Sent ping:', pingNumber);
            }
          }, 25000);
        });

        ws.on('message', (data: any) => {
          try {
            const message = data.toString();
            
            // Обрабатываем pong сообщения
            if (message.startsWith('pong-')) {
              console.log('[Server WebSocket] ✅ [PING/PONG] Получен pong:', message);
              sendSSE({ type: 'pong', data: message });
              return;
            }

            // Парсим JSON сообщения
            try {
              const jsonData = JSON.parse(message);
              const messageClass = jsonData._class || 'unknown';
              
              // Определяем тип события для логирования
              let eventInfo = '';
              if (messageClass === 'NumberedMessage') {
                if (jsonData.message) {
                  const innerClass = jsonData.message._class || '';
                  if (innerClass.includes('Participant')) {
                    eventInfo = ' [УЧАСТНИК]';
                  } else if (innerClass.includes('Layout') || innerClass.includes('Cell')) {
                    eventInfo = ' [РАСКЛАДКА]';
                  } else if (innerClass.includes('Chat')) {
                    eventInfo = ' [ЧАТ]';
                  } else if (innerClass.includes('Conference')) {
                    eventInfo = ' [КОНФЕРЕНЦИЯ]';
                  }
                } else {
                  eventInfo = ' [SYNC]';
                }
              } else if (messageClass === 'BulkMessage') {
                eventInfo = ` [BULK: ${jsonData.events?.length || 0} событий]`;
              }
              
              console.log(`[Server WebSocket] 📨${eventInfo} Получено сообщение: ${messageClass}`);
              
              // Отправляем сообщение клиенту через SSE
              sendSSE({ 
                type: 'message', 
                data: jsonData 
              });
            } catch (e) {
              // Если не JSON, отправляем как текст
              console.log('[Server WebSocket] ⚠️ [TEXT] Сообщение не JSON, отправляем как текст');
              
              sendSSE({ 
                type: 'message', 
                data: { text: message } 
              });
            }
          } catch (error) {
            console.error('[Server WebSocket] ❌ Ошибка обработки сообщения:', error);
            sendSSE({ 
              type: 'error', 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
          }
        });

        ws.on('error', (error: any) => {
          console.error('[Server WebSocket] ❌ WebSocket error:', error);
          console.error('[Server WebSocket] Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            syscall: error.syscall,
            address: error.address,
            port: error.port,
          });
          
          // Отправляем детальную информацию об ошибке клиенту
          try {
            sendSSE({ 
              type: 'error', 
              error: error.message || 'WebSocket error',
              details: {
                code: error.code,
                errno: error.errno,
                syscall: error.syscall,
              }
            });
          } catch (sseError) {
            console.error('[Server WebSocket] Failed to send SSE error:', sseError);
          }
        });

        ws.on('close', (code: number, reason: Buffer) => {
          console.log('[Server WebSocket] 🔌 Closed:', { code, reason: reason.toString() });
          
          // Удаляем WebSocket соединение из хранилища
          removeWebSocketConnection(sessionId);
          
          sendSSE({ 
            type: 'closed', 
            code, 
            reason: reason.toString() 
          });
          
          if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
          }
          
          controller.close();
        });

      } catch (error) {
        console.error('[Server WebSocket] ❌ Failed to start:', error);
        console.error('[Server WebSocket] Error stack:', error instanceof Error ? error.stack : 'No stack');
        
        try {
          const errorMessage = encoder.encode(
            `data: ${JSON.stringify({ 
              type: 'error', 
              error: error instanceof Error ? error.message : 'Failed to start WebSocket',
              details: error instanceof Error ? {
                name: error.name,
                stack: error.stack,
              } : null
            })}\n\n`
          );
          controller.enqueue(errorMessage);
        } catch (encodeError) {
          console.error('[Server WebSocket] Failed to encode error message:', encodeError);
        }
        
        // Не закрываем контроллер сразу, даем клиенту получить сообщение об ошибке
        setTimeout(() => {
          controller.close();
        }, 100);
      }
    },

    cancel() {
      console.log('[Server WebSocket] Stream cancelled');
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
      // Удаляем WebSocket соединение из хранилища
      removeWebSocketConnection(sessionId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Отключаем буферизацию для nginx
    },
  });
}

