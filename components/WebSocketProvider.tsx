'use client';

import { useEffect } from 'react';

/**
 * Компонент для автоматического запуска WebSocket Event Channel
 * при загрузке приложения, если есть активная сессия
 * 
 * Этот компонент не рендерит никакого DOM, только запускает WebSocket в useEffect
 * что предотвращает проблемы с гидратацией
 */
export default function WebSocketProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Проверяем наличие sessionId и запускаем WebSocket
    // Все выполняется только на клиенте после монтирования
    const initWebSocket = async () => {
      if (typeof window === 'undefined') return;
      
      const sessionId = localStorage.getItem('session_id');
      if (sessionId) {
        try {
          const { startEventChannel } = await import('@/lib/websocket');
          startEventChannel(sessionId);
        } catch (error) {
          console.error('[WebSocketProvider] Failed to start Event Channel:', error);
        }
      }
    };

    // Небольшая задержка для обеспечения готовности DOM
    const timer = setTimeout(initWebSocket, 100);
    
    return () => {
      clearTimeout(timer);
    };
  }, []);

  // Просто возвращаем children без обертки
  // Это гарантирует, что HTML на сервере и клиенте идентичен
  return children;
}

