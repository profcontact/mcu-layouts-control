import { NextRequest } from 'next/server';
import { getAuthHeaders } from '../../_helpers/auth';
import { setWebSocketConnection, removeWebSocketConnection } from '../_ws-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WS_HOST = process.env.WS_HOST;

// Проверка переменных окружения при загрузке модуля (только в dev режиме)
if (process.env.NODE_ENV === 'development' && !WS_HOST) {
  console.error('[WebSocket Event Channel] ⚠️  WARNING: WS_HOST environment variable is not set!');
  console.error('[WebSocket Event Channel] Make sure .env.local file exists in the project root with WS_HOST variable');
}
/**
 * API Route для проксирования WebSocket Event Channel через Server-Sent Events (SSE)
 * На сервере устанавливается WebSocket соединение с внешним API,
 * а клиент получает события через SSE
 */
export async function GET(request: NextRequest) {
  // EventSource не поддерживает кастомные заголовки, поэтому получаем Session ID из query параметра
  // Также пробуем получить из заголовков на случай если используется другой клиент
  const sessionIdFromQuery = request.nextUrl.searchParams.get('session');
  const authHeaders = getAuthHeaders(request);
  const sessionId = sessionIdFromQuery || authHeaders['Session'] || authHeaders['session'];
  
  if (!sessionId) {
    console.error('[Server WebSocket] No sessionId provided');
    return new Response(
      JSON.stringify({ error: 'Session ID is required. Provide it as query parameter: ?session=YOUR_SESSION_ID' }),
      { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Создаем ReadableStream для SSE
  const encoder = new TextEncoder();
  let ws: any = null;
  let pingInterval: NodeJS.Timeout | null = null;
  let connectionTimeout: NodeJS.Timeout | null = null;
  let isControllerClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Функция для безопасного закрытия контроллера
      const closeController = () => {
        if (!isControllerClosed && controller.desiredSize !== null) {
          try {
            controller.close();
            isControllerClosed = true;
          } catch (error: any) {
            // Игнорируем ошибки, если контроллер уже закрыт
            if (error.code !== 'ERR_INVALID_STATE') {
              console.error('[Server WebSocket] ❌ Error closing controller:', error);
            }
          }
        }
      };

      try {
        if (!WS_HOST) {
          console.error('[Server WebSocket] WS_HOST environment variable is not set');
          const errorMessage = encoder.encode(
            `data: ${JSON.stringify({ 
              type: 'error', 
              error: 'Конфигурация сервера не настроена. Обратитесь к администратору.'
            })}\n\n`
          );
          controller.enqueue(errorMessage);
          closeController();
          return;
        }

        // Генерируем busId
        const busId = crypto.randomUUID();
        const wsUrl = `wss://${WS_HOST}/websocket/eventbus/${busId}/json/source/VIDEOCONFERENCE?Session=${encodeURIComponent(sessionId)}`;
        
        // Используем динамический импорт для ws (если установлен) или встроенный WebSocket
        let WebSocketClass: any;
        
        try {
          // Пробуем использовать библиотеку 'ws' для Node.js
          const wsModule = await import('ws');
          WebSocketClass = wsModule.default;
        } catch (err) {
          // Если 'ws' не установлена, используем встроенный WebSocket (Node.js 18+)
          WebSocketClass = globalThis.WebSocket;
        }

        if (!WebSocketClass) {
          console.error('[Server WebSocket] ❌ WebSocket class is not available');
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
        
        // Устанавливаем таймаут для подключения (10 секунд)
        connectionTimeout = setTimeout(() => {
          if (ws && ws.readyState !== 1) { // WebSocket.OPEN
            console.error('[Server WebSocket] Connection timeout after 10 seconds');
            ws.close();
            sendSSE({ 
              type: 'error', 
              error: 'WebSocket connection timeout. Please check your network connection and try again.' 
            });
            closeController();
          }
        }, 10000);
        
        // Отправляем начальное сообщение клиенту через SSE
        const sendSSE = (data: any) => {
          try {
            // Проверяем, что контроллер не закрыт
            if (isControllerClosed || controller.desiredSize === null) {
              return;
            }
            const message = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          } catch (error: any) {
            // Игнорируем ошибки отправки, если контроллер закрыт
            if (error.message?.includes('closed') || error.code === 'ERR_INVALID_STATE') {
              isControllerClosed = true;
            } else {
              console.error('[Server WebSocket] ❌ Error sending SSE message:', error);
            }
          }
        };

        sendSSE({ type: 'connecting', message: 'Connecting to Event Channel...' });

        ws.on('open', () => {
          // Очищаем таймаут при успешном подключении
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
          }
          
          // Сохраняем WebSocket соединение для возможности отправки сообщений подписки
          // Проверяем, что соединение действительно открыто
          if (ws.readyState === 1) { // WebSocket.OPEN
            setWebSocketConnection(sessionId, { ws, busId });
          } else {
            console.error('[Server WebSocket] ❌ Cannot save WebSocket connection: readyState is not OPEN:', ws.readyState);
          }
          
          // Отправляем busId клиенту при подключении
          sendSSE({ type: 'connected', message: 'Connected to Event Channel', busId: busId });

          // Начинаем отправлять ping каждые 25 секунд
          pingInterval = setInterval(() => {
            if (ws && ws.readyState === 1) { // WebSocket.OPEN
              const pingNumber = Date.now();
              ws.send(`ping-${pingNumber}`);
            }
          }, 25000);
        });

        ws.on('message', (data: any) => {
          try {
            const message = data.toString();
            
            // Обрабатываем pong сообщения
            if (message.startsWith('pong-')) {
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
              
              // Событие WebSocket получено
              
              // Отправляем сообщение клиенту через SSE
              sendSSE({ 
                type: 'message', 
                data: jsonData 
              });
            } catch (e) {
              // Если не JSON, отправляем как текст
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
          console.error('[Server WebSocket] ❌ WebSocket error occurred:');
          console.error('[Server WebSocket] Error message:', error.message);
          console.error('[Server WebSocket] Error code:', error.code);
          console.error('[Server WebSocket] Error details:', {
            errno: error.errno,
            syscall: error.syscall,
            address: error.address,
            port: error.port,
            stack: error.stack,
          });
          console.error('[Server WebSocket] WebSocket URL was:', wsUrl.replace(sessionId, sessionId.substring(0, 20) + '...'));
          console.error('[Server WebSocket] WS_HOST:', WS_HOST);
          console.error('[Server WebSocket] Full error object:', error);
          
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
          // WebSocket соединение закрыто
          
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
          
          closeController();
        });

      } catch (error) {
        console.error('[Server WebSocket] Failed to start:', error);
        
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
          closeController();
        }, 100);
      }
    },

    cancel() {
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

