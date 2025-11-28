import { api } from './api-client';
import { logger } from './logger';
import { withRetry, waitFor, shouldRetryOn } from './retry';

export interface Conference {
  // Основные поля из PlannedConferenceSessionPersonalSummaryInfoRestDTO
  conferenceSessionId?: string; // Может быть null для будущих сессий
  conferenceId: string;
  name: string;
  description?: string;
  createDate: number; // UNIX time in ms
  updateDate?: number; // UNIX time in ms
  startDate: number; // UNIX time in ms
  actualStartDate?: number; // UNIX time in ms - фактическое время начала
  lastMediaSessionStartDate?: number; // UNIX time in ms - время начала последней медиа-сессии
  duration: number; // Длительность в миллисекундах
  state: string; // ConferenceSessionState
  sessionNumber: number;
  room: boolean; // true для комнат, false для событий
  ownerName?: string;
  ownerProfileId?: string;
  onlineParticipantsCount: number;
  invitedParticipantsCount: number;
  deleted?: boolean;
  personalParticipationInfo?: any; // PlannedConferenceSessionPersonalParticipationInfoRestDTO
  
  // Для обратной совместимости
  id?: string; // Алиас для conferenceSessionId или conferenceId
  startTime?: string; // Форматированная дата начала
  endTime?: string; // Форматированная дата окончания
  status?: string; // Алиас для state
}

export interface Participant {
  id: string;
  userId: string;
  name: string;
  avatar?: string;
  roles?: string[]; // Роли участника (ATTENDEE, MODERATOR, SPEAKER и т.д.)
  isRegisteredUser?: boolean; // Зарегистрированный или не зарегистрированный участник
  mediaState?: 'AUDIO' | 'VIDEO' | 'AUDIO_VIDEO' | 'NONE'; // Состояние медиа потока участника
  demonstrationType?: string; // Тип демонстрации из streamType (например, 'SCREEN_SHARE')
}

export interface MediaInfo {
  participants: Participant[];
  ownParticipantData?: {
    speakerStreamPublishUrl?: string; // Используется для publish и subscribe на mixed stream
    screenShareStreamPublishUrl?: string; // Используется для publish screen share
    subscribeLimit?: string; // MediaState
    inputAudioGain?: number;
    outputAudioGain?: number;
    maxMediaProfile?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

export type CellType = 'EMPTY' | 'AUTO' | 'CAROUSEL' | 'FIXED' | 'PICTURE' | 'SPEAKER' | 'PREVIOUS_SPEAKER';

export interface LayoutCell {
  id: string;
  row: number;
  col: number;
  width: number;
  height: number;
  participantId?: string;
  cellType?: CellType; // Тип ячейки для пустых ячеек
  speakerIndex?: number; // Номер докладчика (0-5) для типов SPEAKER и PREVIOUS_SPEAKER
  // Опциональные поля для прямого позиционирования в процентах
  left?: number; // в процентах
  top?: number; // в процентах
  widthPercent?: number; // в процентах
  heightPercent?: number; // в процентах
}

export interface Layout {
  layoutId: number;
  layoutType: string;
  name: string;
  description?: string;
  isSystem: boolean;
  cellCount: number;
  [key: string]: any; // Для дополнительных полей из API
}

export interface LayoutsResponse {
  totalCount: number;
  hasNext: boolean;
  data: Layout[];
}

// API методы - используют Next.js API routes для обхода CORS
export const authAPI = {
  login: async (login: string, password: string) => {
    const data = await api.post('/api/auth/login', { login, password }, { skipAuthRedirect: true });
    
    // Проверяем разные возможные поля для токена (приоритет sessionId, затем loginToken)
    const sessionId = data.sessionId;
    const loginToken = data.loginToken;
    const token = sessionId || loginToken || data.token || data.access_token || data.accessToken || data.authToken || data.auth_token;
    
    if (!token) {
      throw new Error('Токен авторизации не был получен от сервера');
    }

    // Сохраняем sessionId как основной токен, если он есть
    if (sessionId) {
      localStorage.setItem('auth_token', sessionId);
      localStorage.setItem('session_id', sessionId);
      
      // Запускаем Event Channel для поддержания сессии активной
      if (typeof window !== 'undefined') {
        setTimeout(async () => {
          try {
            const { startEventChannel } = await import('./websocket');
            startEventChannel(sessionId);
          } catch (error) {
            logger.error('[API]', 'Failed to start WebSocket:', error);
          }
        }, 200);
      }
    } else {
      localStorage.setItem('auth_token', token);
    }
    
    // Сохраняем loginToken отдельно, если он есть и отличается
    if (loginToken && loginToken !== token) {
      localStorage.setItem('login_token', loginToken);
    }
    
    // Убеждаемся, что токен сохранился
    const savedToken = localStorage.getItem('auth_token');
    if (savedToken !== token) {
      throw new Error('Не удалось сохранить токен авторизации');
    }
    
    return data;
  },

  logout: () => {
    // Останавливаем Event Channel при выходе
    if (typeof window !== 'undefined') {
      import('./websocket').then(({ stopEventChannel }) => {
        stopEventChannel();
      });
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('session_id');
    localStorage.removeItem('login_token');
  },
};

export const conferencesAPI = {
  getList: async (): Promise<Conference[]> => {
    const result = await api.get('/api/conferences');
    
    // Если result уже массив, возвращаем его, иначе извлекаем data
    let conferences: any[] = Array.isArray(result) ? result : (result.data || []);
    
    // Преобразуем данные в формат Conference для обратной совместимости
    return conferences.map((conf: any) => ({
      ...conf,
      id: conf.conferenceSessionId || conf.conferenceId,
      startTime: conf.startDate ? new Date(conf.startDate).toLocaleString('ru-RU') : undefined,
      endTime: conf.actualEndDate ? new Date(conf.actualEndDate).toLocaleString('ru-RU') : 
               (conf.startDate && conf.duration ? new Date(conf.startDate + conf.duration).toLocaleString('ru-RU') : undefined),
      status: conf.state,
    }));
  },

  getById: async (id: string): Promise<Conference> => {
    return api.get(`/api/conferences/${id}`);
  },

  // Присоединиться к конференции (POST /conference-sessions/{conferenceSessionId}/join)
  join: async (conferenceSessionId: string, eventBusId: string): Promise<any> => {
    return api.post(`/api/conferences/${conferenceSessionId}/join`, {
      eventBusId,
      supportedProtocols: ['WEBRTC'],
    });
  },

  // Получить медиа-информацию конференции (GET /conference-sessions/{conferenceSessionId}/media/info)
  getMediaInfo: async (conferenceSessionId: string): Promise<MediaInfo> => {
    const data = await api.get(`/api/conferences/${conferenceSessionId}/media-info`);
    
    // Преобразуем участников из ParticipantRestDTO в формат Participant
    const participants: Participant[] = (data.participants || []).map((p: any) => {
      let avatarUrl: string | undefined;
      const avatarResourceId = p.avatarResourceId || p.avatarResource;
      
      if (avatarResourceId) {
        avatarUrl = `/api/resources/${avatarResourceId}`;
        const sessionId = typeof window !== 'undefined' ? localStorage.getItem('session_id') : null;
        if (sessionId) {
          avatarUrl += `?session=${encodeURIComponent(sessionId)}`;
        }
      }
      
      const participantId = p.participantId;
      if (!participantId) {
        logger.warn('[API]', 'Participant without participantId:', p);
      }
      
      const mediaState = p.webMediaInfo?.speakerStreamInfo?.state || p.mediaState || 'NONE';
      const screenShareState = p.webMediaInfo?.screenShareStreamInfo?.state;
      const demonstrationType = screenShareState && screenShareState !== 'NONE' ? 'SCREEN_SHARE' : undefined;
      
      return {
        id: participantId,
        userId: p.profileId || participantId,
        name: p.name || 'Без имени',
        avatar: avatarUrl,
        roles: p.roles || [],
        isRegisteredUser: p.isRegisteredUser !== undefined ? p.isRegisteredUser : (p.isRegistered !== undefined ? p.isRegistered : true),
        mediaState,
        demonstrationType,
      };
    });
    
    return { ...data, participants };
  },

  // Обновить параметры конференции (PATCH /conference-sessions/{conferenceSessionId})
  update: async (conferenceSessionId: string, updateParams: {
    layout?: {
      value: {
        layoutId: number;
        showNames?: boolean;
        showDemonstrationWithVideos?: boolean;
        layoutConfiguration?: any;
      } | null;
    };
    [key: string]: any;
  }): Promise<void> => {
    return api.patch(`/api/conferences/${conferenceSessionId}`, updateParams);
  },

  // Выйти из конференции (POST /conference-sessions/{conferenceSessionId}/leave)
  leave: async (conferenceSessionId: string): Promise<void> => {
    try {
      await api.post(`/api/conferences/${conferenceSessionId}/leave`, {});
    } catch (err) {
      // Игнорируем ошибки при выходе (например, если уже вышли или сессия завершена)
      logger.warn('[API]', 'Error leaving conference (ignored):', err);
    }
  },

};

export const layoutAPI = {
  // Получить список всех раскладок
  getLayouts: async (): Promise<Layout[]> => {
    const result: LayoutsResponse = await api.get('/api/layouts');
    return result.data || [];
  },

  // Получить настройки конкретной раскладки по ID
  getLayoutById: async (layoutId: number): Promise<any> => {
    return api.get(`/api/layouts/${layoutId}`);
  },

  // Получить раскладку для конкретной конференции
  getLayout: async (conferenceId: string): Promise<LayoutCell[] | { layoutId?: number; cells?: LayoutCell[]; [key: string]: any }> => {
    return api.get(`/api/conferences/${conferenceId}/layout`);
  },

  // Обновить раскладку для конференции
  updateLayout: async (conferenceId: string, layout: LayoutCell[]) => {
    return api.put(`/api/conferences/${conferenceId}/layout`, layout);
  },
};

