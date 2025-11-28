// Утилиты для поддержания WebSocket соединения для Event Channel через Server-Sent Events (SSE)
// WebSocket соединение устанавливается на сервере через API route /api/websocket/event-channel,
// а клиент получает события через SSE

import { logger } from './logger';

let eventSource: EventSource | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let currentBusId: string | null = null; // Текущий busId из WebSocket соединения
let eventChannelConnected = false; // Флаг успешного подключения Event Channel
let eventChannelConnectedCallbacks: Array<() => void> = []; // Колбэки для ожидания подключения
type ConferenceEventCallback = (event: any) => void;
let conferenceEventCallbacks: Array<ConferenceEventCallback> = []; // Колбэки для обработки событий конференции

// Функция для получения информации о событии
function getEventInfo(event: any): { category: string; name: string; description?: string; relatedTo?: string } {
  const eventClass = event._class || '';
  
  // Категории событий
  if (eventClass.includes('Participant')) {
    if (eventClass.includes('Leave') || event.leaveReason !== undefined) {
      return {
        category: 'УЧАСТНИК',
        name: 'Участник покинул конференцию',
        description: event.leaveReason ? `Причина: ${event.leaveReason}` : undefined,
        relatedTo: `participantId: ${event.participantId || event.id || 'unknown'}`,
      };
    }
    if (eventClass.includes('Add') || eventClass.includes('Join')) {
      return {
        category: 'УЧАСТНИК',
        name: 'Участник присоединился',
        relatedTo: `participantId: ${event.participantId || event.id || 'unknown'}`,
      };
    }
    if (eventClass.includes('Change') || eventClass.includes('Update')) {
      return {
        category: 'УЧАСТНИК',
        name: 'Изменение данных участника',
        relatedTo: `participantId: ${event.participantId || event.id || 'unknown'}`,
      };
    }
    return {
      category: 'УЧАСТНИК',
      name: 'Событие участника',
      relatedTo: `participantId: ${event.participantId || event.id || 'unknown'}`,
    };
  }
  
  if (eventClass.includes('Layout') || eventClass.includes('Cell')) {
    return {
      category: 'РАСКЛАДКА',
      name: 'Изменение раскладки',
      relatedTo: event.layoutId ? `layoutId: ${event.layoutId}` : event.conferenceSessionId ? `conferenceSessionId: ${event.conferenceSessionId}` : undefined,
    };
  }
  
  if (eventClass.includes('Chat') || eventClass.includes('Message')) {
    return {
      category: 'ЧАТ',
      name: 'Событие чата',
      relatedTo: event.conferenceSessionId ? `conferenceSessionId: ${event.conferenceSessionId}` : undefined,
    };
  }
  
  if (eventClass.includes('Conference') || eventClass.includes('Session')) {
    if (eventClass.includes('Start')) {
      return {
        category: 'КОНФЕРЕНЦИЯ',
        name: 'Конференция началась',
        relatedTo: event.conferenceSessionId ? `conferenceSessionId: ${event.conferenceSessionId}` : undefined,
      };
    }
    if (eventClass.includes('End') || eventClass.includes('Finish')) {
      return {
        category: 'КОНФЕРЕНЦИЯ',
        name: 'Конференция завершена',
        relatedTo: event.conferenceSessionId ? `conferenceSessionId: ${event.conferenceSessionId}` : undefined,
      };
    }
    return {
      category: 'КОНФЕРЕНЦИЯ',
      name: 'Событие конференции',
      relatedTo: event.conferenceSessionId ? `conferenceSessionId: ${event.conferenceSessionId}` : undefined,
    };
  }
  
  if (eventClass.includes('Media')) {
    return {
      category: 'МЕДИА',
      name: 'Событие медиа',
      relatedTo: event.participantId ? `participantId: ${event.participantId}` : undefined,
    };
  }
  
  return {
    category: 'ДРУГОЕ',
    name: eventClass || 'Неизвестное событие',
  };
}

// Функция для получения текущего busId
export function getCurrentBusId(): string | null {
  return currentBusId;
}

export function startEventChannel(sessionId: string): void {
  if (typeof window === 'undefined') {
    logger.warn('[EventChannel]', 'Called on server side, skipping');
    return;
  }
  
  logger.info('[EventChannel]', `Starting with sessionId: ${sessionId ? sessionId.substring(0, 20) + '...' : 'MISSING'}`);
  
  if (!sessionId) {
    logger.error('[EventChannel]', 'sessionId is missing, cannot start Event Channel');
    return;
  }
  
  // Закрываем существующее соединение если есть
  stopEventChannel();

  // Сбрасываем флаги
  eventChannelConnected = false;
  eventChannelConnectedCallbacks = [];
  // НЕ очищаем conferenceEventCallbacks, чтобы сохранить подписки при переподключении
  // conferenceEventCallbacks = [];
  
  try {
    logger.info('[EventChannel]', 'Connecting to server-side WebSocket proxy via SSE...');
    
    // Подключаемся к API route, который проксирует WebSocket через SSE
    // EventSource не поддерживает кастомные заголовки, поэтому передаем Session ID через query параметр
    // На сервере он будет извлечен и использован для WebSocket соединения
    eventSource = new EventSource(`/api/websocket/event-channel?session=${encodeURIComponent(sessionId)}`);
    
    eventSource.onopen = () => {
      logger.success('[EventChannel]', 'SSE connection opened');
      reconnectAttempts = 0;
    };
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connecting':
            logger.info('[EventChannel]', data.message);
            break;
            
          case 'connected':
            logger.success('[EventChannel]', data.message);
            // Сохраняем busId если он пришел от сервера
            if (data.busId) {
              currentBusId = data.busId;
              logger.info('[EventChannel]', `BusId received: ${currentBusId}`);
            }
            // Устанавливаем флаг подключения и вызываем колбэки
            eventChannelConnected = true;
            logger.success('[EventChannel]', 'Event Channel connected, calling callbacks');
            eventChannelConnectedCallbacks.forEach(callback => callback());
            eventChannelConnectedCallbacks = [];
            break;
            
          case 'pong':
            logger.debug('[EventChannel]', 'Received pong:', data.data);
            break;
            
          case 'message':
            // Обрабатываем сообщения от сервера
            const messageData = data.data;
            const messageClass = messageData._class || 'unknown';
            
            // Согласно документации, при подключении сервер отправляет синхронизационное сообщение
            // где "message" отсутствует, но есть sequenceNumber
            if (messageClass === 'NumberedMessage' && !messageData.message) {
              logger.info('[EventChannel]', `[SYNC] Sync message - sequenceNumber: ${messageData.sequenceNumber}`);
              logger.success('[EventChannel]', '[SYNC] Synchronization completed');
            } else if (messageClass === 'BulkMessage') {
              const eventsCount = messageData.events?.length || 0;
              logger.info('[EventChannel]', `[BULK] Bulk events - count: ${eventsCount}`);
              
              if (messageData.events && Array.isArray(messageData.events)) {
                messageData.events.forEach((event: any, index: number) => {
                  const eventClass = event._class || 'unknown';
                  const eventInfo = getEventInfo(event);
                  
                  logger.event(eventInfo.category, `Event ${index + 1}/${eventsCount}: ${eventInfo.name}`, {
                    class: eventClass,
                    ...(eventInfo.description && { description: eventInfo.description }),
                    ...(eventInfo.relatedTo && { relatedTo: eventInfo.relatedTo }),
                  });
                  
                  // Вызываем колбэки для обработки событий конференции
                  if (event._class) {
                    conferenceEventCallbacks.forEach(callback => {
                      try {
                        callback(event);
                      } catch (error) {
                        logger.error('[EventChannel]', 'Error in conference event callback:', error);
                      }
                    });
                  }
                });
              }
            } else if (messageClass === 'NumberedMessage' && messageData.message) {
              const innerEvent = messageData.message;
              const eventClass = innerEvent._class || 'unknown';
              const eventInfo = getEventInfo(innerEvent);
              
              logger.event(eventInfo.category, `Conference event - seq: ${messageData.sequenceNumber}`, {
                name: eventInfo.name,
                class: eventClass,
                ...(eventInfo.description && { description: eventInfo.description }),
                ...(eventInfo.relatedTo && { relatedTo: eventInfo.relatedTo }),
              });
              
              // Вызываем колбэки для обработки событий конференции
              if (innerEvent._class) {
                logger.debug('[EventChannel]', `Calling ${conferenceEventCallbacks.length} callbacks for ${innerEvent._class}`);
                conferenceEventCallbacks.forEach((callback, index) => {
                  try {
                    callback(innerEvent);
                  } catch (error) {
                    logger.error('[EventChannel]', `Error in callback ${index + 1}:`, error);
                  }
                });
              } else {
                logger.warn('[EventChannel]', 'innerEvent has no _class, skipping callbacks');
              }
            } else {
              // Логируем любые другие типы сообщений
              logger.debug('[EventChannel]', `[UNKNOWN] Unknown message type: ${messageClass}`, Object.keys(messageData));
            }
            break;
            
          case 'error':
            logger.error('[EventChannel]', 'Server error:', data.error);
            // Если это ошибка авторизации, редиректим на вход
            const errorMessage = data.error?.toLowerCase() || '';
            if (errorMessage.includes('auth') || 
                errorMessage.includes('unauthorized') || 
                errorMessage.includes('session') ||
                errorMessage.includes('401') ||
                errorMessage.includes('403')) {
              logger.error('[EventChannel]', 'Auth error detected, redirecting to login');
              stopEventChannel();
              localStorage.removeItem('session_id');
              localStorage.removeItem('auth_token');
              localStorage.removeItem('login_token');
              window.location.href = '/login';
            }
            break;
            
          case 'closed':
            logger.info('[EventChannel]', `Connection closed - code: ${data.code}, reason: ${data.reason}`);
            
            // Сбрасываем флаг подключения при закрытии
            eventChannelConnected = false;
            
            // Коды закрытия WebSocket:
            // 1000 - нормальное закрытие
            // 1001 - уход со страницы
            // 1006 - аномальное закрытие (нет close frame)
            // 1008 - нарушение политики
            // 1003 - недопустимые данные
            // 4001-4003 - ошибки авторизации (если используются)
            
            // Если это ошибка авторизации или превышено количество попыток переподключения
            const isAuthError = data.code === 1008 || data.code === 4001 || data.code === 4002 || data.code === 4003;
            const maxAttemptsReached = reconnectAttempts >= MAX_RECONNECT_ATTEMPTS;
            
            if (isAuthError || maxAttemptsReached) {
              logger.error('[EventChannel]', 'WebSocket closed due to auth error or max attempts, redirecting to login');
              stopEventChannel();
              localStorage.removeItem('session_id');
              localStorage.removeItem('auth_token');
              localStorage.removeItem('login_token');
              window.location.href = '/login';
              return;
            }
            
            // Пытаемся переподключиться если это не было намеренное закрытие
            if (data.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              reconnectAttempts++;
              logger.info('[EventChannel]', `Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
              setTimeout(() => {
                const newSessionId = localStorage.getItem('session_id');
                if (newSessionId) {
                  startEventChannel(newSessionId);
                } else {
                  logger.error('[EventChannel]', 'No sessionId found, redirecting to login');
                  stopEventChannel();
                  window.location.href = '/login';
                }
              }, 2000);
            } else if (data.code !== 1000) {
              logger.error('[EventChannel]', 'Max reconnection attempts reached, redirecting to login');
              stopEventChannel();
              localStorage.removeItem('session_id');
              localStorage.removeItem('auth_token');
              localStorage.removeItem('login_token');
              window.location.href = '/login';
            }
            break;
            
          default:
            logger.debug('[EventChannel]', 'Unknown message type:', data.type, data);
        }
      } catch (e) {
        logger.error('[EventChannel]', 'Error parsing message:', e);
        logger.debug('[EventChannel]', 'Raw message:', event.data);
      }
    };
    
    eventSource.onerror = (error) => {
      logger.error('[EventChannel]', 'SSE error:', error);
      logger.debug('[EventChannel]', `EventSource readyState: ${eventSource?.readyState}, URL: ${eventSource?.url}`);
      
      // EventSource.CONNECTING = 0, EventSource.OPEN = 1, EventSource.CLOSED = 2
      // Если readyState === 0 (CONNECTING), это может означать, что соединение еще не установлено
      // или произошла ошибка при подключении
      const readyState = eventSource?.readyState;
      
      // Если readyState === CONNECTING (0), соединение еще пытается подключиться
      // Если readyState === CLOSED (2), соединение закрыто
      if (readyState === EventSource.CLOSED) {
        logger.info('[EventChannel]', 'SSE connection closed');
        
        // Сбрасываем флаг подключения при закрытии
        eventChannelConnected = false;
        
        // Проверяем статус ответа от сервера (если доступен)
        // Если это ошибка 401 или 403, значит проблема с авторизацией
        const isAuthError = eventSource?.url?.includes('401') || eventSource?.url?.includes('403');
        
        if (isAuthError || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          logger.error('[EventChannel]', 'SSE closed due to auth error or max attempts, redirecting to login');
          stopEventChannel();
          localStorage.removeItem('session_id');
          localStorage.removeItem('auth_token');
          localStorage.removeItem('login_token');
          window.location.href = '/login';
          return;
        }
        
        // Пытаемся переподключиться
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          logger.info('[EventChannel]', `Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
          setTimeout(() => {
            const newSessionId = localStorage.getItem('session_id');
            if (newSessionId) {
              startEventChannel(newSessionId);
            } else {
              logger.error('[EventChannel]', 'No sessionId found, redirecting to login');
              stopEventChannel();
              window.location.href = '/login';
            }
          }, 2000);
        } else {
          logger.error('[EventChannel]', 'Max reconnection attempts reached, redirecting to login');
          stopEventChannel();
          localStorage.removeItem('session_id');
          localStorage.removeItem('auth_token');
          localStorage.removeItem('login_token');
          window.location.href = '/login';
        }
      } else if (readyState === EventSource.CONNECTING) {
        logger.debug('[EventChannel]', `SSE still connecting, readyState: ${readyState}`);
      }
    };
    
    logger.success('[EventChannel]', 'EventSource created, waiting for connection...');
    
  } catch (error) {
    logger.error('[EventChannel]', 'Failed to start Event Channel:', error);
    logger.debug('[EventChannel]', 'Error stack:', error instanceof Error ? error.stack : 'No stack');
  }
}

export function stopEventChannel(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  
  reconnectAttempts = 0;
  currentBusId = null; // Сбрасываем busId при остановке
  eventChannelConnected = false; // Сбрасываем флаг подключения
  eventChannelConnectedCallbacks = []; // Очищаем колбэки ожидания подключения
  // НЕ очищаем conferenceEventCallbacks, чтобы сохранить подписки при переподключении
  // conferenceEventCallbacks = [];
}

// Функция для подписки на события конференции
export function onConferenceEvent(callback: ConferenceEventCallback): () => void {
  conferenceEventCallbacks.push(callback);
  logger.success('[EventChannel]', `Conference event callback registered. Total: ${conferenceEventCallbacks.length}`);
  
  // Возвращаем функцию для отписки
  return () => {
    const index = conferenceEventCallbacks.indexOf(callback);
    if (index > -1) {
      conferenceEventCallbacks.splice(index, 1);
      logger.cleanup('[EventChannel]', `Conference event callback unregistered. Total: ${conferenceEventCallbacks.length}`);
    }
  };
}

// Функция для ожидания подключения Event Channel
export function waitForEventChannelConnection(timeout: number = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (eventChannelConnected) {
      resolve();
      return;
    }
    
    const timeoutId = setTimeout(() => {
      reject(new Error('Event Channel connection timeout'));
    }, timeout);
    
    eventChannelConnectedCallbacks.push(() => {
      clearTimeout(timeoutId);
      resolve();
    });
  });
}

export function isEventChannelActive(): boolean {
  return eventSource !== null && eventSource.readyState === EventSource.OPEN;
}
