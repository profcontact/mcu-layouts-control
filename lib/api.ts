// Импортируем WebSocket функции для поддержания сессии
// Используем условный импорт, чтобы избежать проблем на сервере
let websocketModule: typeof import('./websocket') | null = null;

if (typeof window !== 'undefined') {
  import('./websocket').then((module) => {
    websocketModule = module;
  });
}

// Используем Next.js API routes для обхода CORS
// Согласно документации API, есть два способа авторизации:
// 1. IvcsAuthSession - sessionId в заголовке Session
// 2. JWTAuth - JWT токен в заголовке Authorization с Bearer
export const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (typeof window !== 'undefined') {
    const sessionId = localStorage.getItem('session_id');
    const token = localStorage.getItem('auth_token');
    const loginToken = localStorage.getItem('login_token');
    
    // Приоритет: sessionId в заголовке Session (IvcsAuthSession)
    if (sessionId) {
      headers['Session'] = sessionId;
    } 
    // Если нет sessionId, используем JWT токен в Authorization (JWTAuth)
    else if (loginToken) {
      headers['Authorization'] = `Bearer ${loginToken}`;
    } else if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  return headers;
};

export interface Conference {
  // Основные поля из PlannedConferenceSessionPersonalSummaryInfoRestDTO
  conferenceSessionId?: string; // Может быть null для будущих сессий
  conferenceId: string;
  name: string;
  description?: string;
  createDate: number; // UNIX time in ms
  updateDate?: number; // UNIX time in ms
  startDate: number; // UNIX time in ms
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
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ login, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Ошибка авторизации');
    }

    const data = await response.json();
    
    // Проверяем разные возможные поля для токена (приоритет sessionId, затем loginToken)
    const sessionId = data.sessionId;
    const loginToken = data.loginToken;
    const token = sessionId || loginToken || data.token || data.access_token || data.accessToken || data.authToken || data.auth_token;
    
    if (token) {
      // Сохраняем sessionId как основной токен, если он есть
      if (sessionId) {
        localStorage.setItem('auth_token', sessionId);
        localStorage.setItem('session_id', sessionId);
        
        // Запускаем Event Channel для поддержания сессии активной
        // Сессия истекает через 1 минуту без активного Event Channel
        if (typeof window !== 'undefined') {
          // Пробуем использовать предзагруженный модуль или загружаем динамически
          const startWebSocket = async () => {
            try {
              let module = websocketModule;
              if (!module) {
                module = await import('./websocket');
                websocketModule = module;
              }
              
              if (typeof module.startEventChannel === 'function') {
                module.startEventChannel(sessionId);
              } else {
                console.error('[API] startEventChannel is not a function');
              }
            } catch (error) {
              console.error('[API] Failed to load/start WebSocket module:', error);
            }
          };
          
          // Запускаем после небольшой задержки, чтобы убедиться что localStorage обновлен
          setTimeout(() => {
            startWebSocket();
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
    } else {
      throw new Error('Токен авторизации не был получен от сервера');
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
    const response = await fetch('/api/conferences', {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Ошибка получения конференций');
    }

    // API возвращает объект с полями data и hasNext (ConferenceSessionsSliceRestDTO)
    const result = await response.json();
    
    // Если result уже массив, возвращаем его, иначе извлекаем data
    let conferences: any[] = Array.isArray(result) ? result : (result.data || []);
    
    // Преобразуем данные в формат Conference для обратной совместимости
    return conferences.map((conf: any) => ({
      ...conf,
      // Для обратной совместимости: используем conferenceSessionId или conferenceId как id
      id: conf.conferenceSessionId || conf.conferenceId,
      // Преобразуем даты в читаемый формат
      startTime: conf.startDate ? new Date(conf.startDate).toLocaleString('ru-RU') : undefined,
      endTime: conf.actualEndDate ? new Date(conf.actualEndDate).toLocaleString('ru-RU') : 
               (conf.startDate && conf.duration ? new Date(conf.startDate + conf.duration).toLocaleString('ru-RU') : undefined),
      // Используем state как status
      status: conf.state,
    }));
  },

  getById: async (id: string): Promise<Conference> => {
    const response = await fetch(`/api/conferences/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Ошибка получения конференции');
    }

    return response.json();
  },

  // Присоединиться к конференции (POST /conference-sessions/{conferenceSessionId}/join)
  join: async (conferenceSessionId: string, eventBusId: string): Promise<any> => {
    const response = await fetch(`/api/conferences/${conferenceSessionId}/join`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        eventBusId: eventBusId,
        supportedProtocols: ['WEBRTC2'],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Ошибка присоединения к конференции');
    }

    return response.json();
  },

  // Получить медиа-информацию конференции (GET /conference-sessions/{conferenceSessionId}/media/info)
  getMediaInfo: async (conferenceSessionId: string): Promise<{ participants: Participant[]; [key: string]: any }> => {
    const response = await fetch(`/api/conferences/${conferenceSessionId}/media-info`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Ошибка получения медиа-информации конференции');
    }

    const data = await response.json();
    
    // Преобразуем участников из ParticipantRestDTO в формат Participant
    const participants: Participant[] = (data.participants || []).map((p: any) => {
      // Формируем URL аватара
      // В ответе API используется avatarResourceId
      let avatarUrl: string | undefined = undefined;
      const avatarResourceId = p.avatarResourceId || p.avatarResource;
      if (avatarResourceId) {
        avatarUrl = `/api/resources/${avatarResourceId}`;
        const sessionId = typeof window !== 'undefined' ? localStorage.getItem('session_id') : null;
        if (sessionId) {
          avatarUrl += `?session=${encodeURIComponent(sessionId)}`;
        }
      }
      
      // В ответе API участники имеют поле participantId
      const participantId = p.participantId;
      
      if (!participantId) {
        console.error('[conferencesAPI.getMediaInfo] Participant without participantId:', p);
      }
      
      // Получаем состояние медиа из webMediaInfo.speakerStreamInfo.state
      const mediaState = p.webMediaInfo?.speakerStreamInfo?.state || p.mediaState || 'NONE';
      
      // Проверяем состояние демонстрации из screenShareStreamInfo.state
      const screenShareState = p.webMediaInfo?.screenShareStreamInfo?.state;
      const demonstrationType = screenShareState && screenShareState !== 'NONE' ? 'SCREEN_SHARE' : undefined;
      
      return {
        id: participantId, // Используем participantId из API напрямую
        userId: p.profileId || participantId,
        name: p.name || 'Без имени',
        avatar: avatarUrl,
        roles: p.roles || [],
        isRegisteredUser: p.isRegisteredUser !== undefined ? p.isRegisteredUser : (p.isRegistered !== undefined ? p.isRegistered : true),
        mediaState: mediaState, // Состояние медиа из webMediaInfo.speakerStreamInfo.state
        demonstrationType: demonstrationType, // Состояние демонстрации из webMediaInfo.screenShareStreamInfo.state
      };
    });
    
    return {
      ...data,
      participants,
    };
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
    const response = await fetch(`/api/conferences/${conferenceSessionId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updateParams),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Ошибка обновления конференции');
    }

    // PATCH возвращает 204 No Content, поэтому не парсим JSON
    if (response.status !== 204) {
      return response.json();
    }
  },

  // Подписаться на события конференции через WebSocket
  subscribeToEvents: async (conferenceSessionId: string): Promise<void> => {
    // Получаем sessionId для передачи в query параметре (fallback)
    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('session_id') : null;
    const url = sessionId 
      ? `/api/websocket/subscribe-conference?session=${encodeURIComponent(sessionId)}`
      : '/api/websocket/subscribe-conference';
    
    // Ждем подключения Event Channel перед подпиской
    if (typeof window !== 'undefined') {
      try {
        const { waitForEventChannelConnection } = await import('./websocket');
        await waitForEventChannelConnection(15000); // Ждем до 15 секунд
        
        // Дополнительная задержка для того, чтобы сервер успел сохранить WebSocket соединение
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда задержка для сохранения соединения
      } catch (err: any) {
        // Продолжаем попытки подписки даже если Event Channel не подключен
      }
    }
    
    // Пробуем подписаться с небольшой задержкой, чтобы WebSocket успел установиться
    // Делаем несколько попыток с экспоненциальной задержкой
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 1s, 2s, 4s, 5s, 5s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ conferenceSessionId }),
        });

        if (!response.ok) {
          const error = await response.json();
          lastError = new Error(error.error || 'Ошибка подписки на события конференции');
          
          // Если это не ошибка "connection not found", не повторяем
          if (!error.error?.includes('WebSocket connection not found')) {
            throw lastError;
          }
          continue;
        }

        await response.json();
        return;
      } catch (err: any) {
        lastError = err;
        if (attempt === 4) {
          console.error('[conferencesAPI] Subscription failed after all attempts:', err);
        }
      }
    }
    
    // Если все попытки не удались, выбрасываем последнюю ошибку
    if (lastError) {
      throw lastError;
    }
  },
};

export const layoutAPI = {
  // Получить список всех раскладок
  getLayouts: async (): Promise<Layout[]> => {
    const response = await fetch('/api/layouts', {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Ошибка получения списка раскладок');
    }

    const result: LayoutsResponse = await response.json();
    // API возвращает объект с полем data, содержащим массив раскладок
    return result.data || [];
  },

  // Получить настройки конкретной раскладки по ID
  getLayoutById: async (layoutId: number): Promise<any> => {
    const response = await fetch(`/api/layouts/${layoutId}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Ошибка получения настроек раскладки');
    }

    return response.json();
  },

  // Получить раскладку для конкретной конференции
  getLayout: async (conferenceId: string): Promise<LayoutCell[] | { layoutId?: number; cells?: LayoutCell[]; [key: string]: any }> => {
    const response = await fetch(`/api/conferences/${conferenceId}/layout`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Ошибка получения раскладки');
    }

    return response.json();
  },


  // Обновить раскладку для конференции
  updateLayout: async (conferenceId: string, layout: LayoutCell[]) => {
    // API может ожидать массив напрямую или объект с полем layout
    // Проверяем документацию API для правильного формата
    const response = await fetch(`/api/conferences/${conferenceId}/layout`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(layout), // Отправляем массив напрямую
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Ошибка обновления раскладки');
    }

    return response.json();
  },
};

