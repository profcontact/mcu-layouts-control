// Кастомный хук для подписки на события конференции

import { useEffect, useRef } from 'react';
import { Participant, LayoutCell } from '@/lib/api';
import { onConferenceEvent } from '@/lib/websocket';
import { logger } from '@/lib/logger';

export interface ConferenceEventHandlers {
  onParticipantJoin?: (participant: Participant) => void;
  onParticipantLeave?: (participantId: string) => void;
  onMediaStateChange?: (participantId: string, mediaState: string, streamType: string) => void;
  onLayoutChange?: (layout: LayoutCell[]) => void;
}

/**
 * Хук для обработки событий конференции через WebSocket
 */
export function useConferenceEvents(
  conferenceId: string | undefined,
  handlers: ConferenceEventHandlers
): void {
  const handlersRef = useRef(handlers);

  // Обновляем ref при изменении handlers
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!conferenceId) {
      return;
    }

    logger.info('[useConferenceEvents]', `Subscribing to conference ${conferenceId} events`);

    // Подписываемся на события
    const unsubscribe = onConferenceEvent((event) => {
      const eventClass = event._class || '';
      const currentHandlers = handlersRef.current;

      // Событие изменения медиа потока
      if (
        eventClass === 'MediaRoomStreamChangedEvent' ||
        eventClass.includes('MediaRoomStreamChanged')
      ) {
        const participantId = event.participantId || event.id;
        const streamType = event.streamType;
        const mediaState = event.mediaState;

        if (participantId && currentHandlers.onMediaStateChange) {
          currentHandlers.onMediaStateChange(participantId, mediaState, streamType);
        }
      }

      // Событие присоединения участника
      else if (eventClass === 'ConferenceSessionParticipantJoinEvent') {
        const participantData = event.participant;

        if (participantData && currentHandlers.onParticipantJoin) {
          const participantId = participantData.participantId;
          
          // Формируем URL аватара
          let avatarUrl: string | undefined;
          const avatarResourceId = participantData.avatarResourceId;

          if (avatarResourceId) {
            avatarUrl = `/api/resources/${avatarResourceId}`;
            const sessionId = typeof window !== 'undefined' 
              ? localStorage.getItem('session_id') 
              : null;
            if (sessionId) {
              avatarUrl += `?session=${encodeURIComponent(sessionId)}`;
            }
          }

          // Получаем состояние медиа
          const mediaState =
            participantData.webMediaInfo?.speakerStreamInfo?.state ||
            participantData.mediaState ||
            'NONE';

          // Проверяем состояние демонстрации
          const screenShareState = participantData.webMediaInfo?.screenShareStreamInfo?.state;
          const demonstrationType =
            screenShareState && screenShareState !== 'NONE' ? 'SCREEN_SHARE' : undefined;

          const newParticipant: Participant = {
            id: participantId,
            userId: participantData.profileId || participantId,
            name: participantData.name || 'Без имени',
            avatar: avatarUrl,
            roles: participantData.roles || [],
            isRegisteredUser:
              participantData.isRegisteredUser !== undefined
                ? participantData.isRegisteredUser
                : true,
            mediaState,
            demonstrationType,
          };

          currentHandlers.onParticipantJoin(newParticipant);
        }
      }

      // Событие выхода участника
      else if (eventClass === 'ConferenceSessionParticipantLeaveEvent') {
        const participantId = event.participantId || event.id || event.participant?.id;

        if (participantId && currentHandlers.onParticipantLeave) {
          currentHandlers.onParticipantLeave(participantId);
        }
      }
    });

    // Cleanup
    return () => {
      logger.cleanup('[useConferenceEvents]', 'Unsubscribing from events');
      unsubscribe();
    };
  }, [conferenceId]);
}

