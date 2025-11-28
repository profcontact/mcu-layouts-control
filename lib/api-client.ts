// Централизованный API клиент с обработкой ошибок и interceptors

import { logger } from './logger';

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: any
  ) {
    super(message);
    this.name = 'APIError';
  }

  isAuthError(): boolean {
    return (
      this.statusCode === 401 ||
      this.statusCode === 403 ||
      this.message.toLowerCase().includes('auth') ||
      this.message.toLowerCase().includes('unauthorized')
    );
  }
}

export interface RequestOptions extends RequestInit {
  skipAuthRedirect?: boolean;
  skipErrorLog?: boolean;
}

/**
 * Централизованная функция для API запросов
 */
export async function apiRequest<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuthRedirect, skipErrorLog, ...fetchOptions } = options;

  try {
    logger.api(fetchOptions.method || 'GET', url);

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorData: any = null;

      // Пытаемся получить детали ошибки из тела ответа
      try {
        errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // Если не JSON, используем statusText
      }

      const apiError = new APIError(errorMessage, response.status, errorData);

      // Автоматический редирект на логин при ошибках авторизации
      if (apiError.isAuthError() && !skipAuthRedirect) {
        logger.error('[API]', 'Auth error, redirecting to login');
        if (typeof window !== 'undefined') {
          // Останавливаем Event Channel
          import('./websocket').then(({ stopEventChannel }) => {
            stopEventChannel();
          });
          
          localStorage.removeItem('auth_token');
          localStorage.removeItem('session_id');
          localStorage.removeItem('login_token');
          window.location.href = '/login';
        }
      }

      if (!skipErrorLog) {
        logger.error('[API]', `Request failed: ${errorMessage}`);
      }

      throw apiError;
    }

    logger.api(fetchOptions.method || 'GET', url, response.status);

    // Для 204 No Content не парсим тело
    if (response.status === 204) {
      return undefined as T;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }

    // Оборачиваем другие ошибки в APIError
    const message = error instanceof Error ? error.message : String(error);
    throw new APIError(message, undefined, error);
  }
}

/**
 * Получает заголовки авторизации
 */
export function getAuthHeaders(): Record<string, string> {
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
}

/**
 * Хелперы для разных HTTP методов
 */
export const api = {
  get: <T = any>(url: string, options?: RequestOptions): Promise<T> =>
    apiRequest<T>(url, { ...options, method: 'GET', headers: getAuthHeaders() }),

  post: <T = any>(url: string, body?: any, options?: RequestOptions): Promise<T> =>
    apiRequest<T>(url, {
      ...options,
      method: 'POST',
      headers: getAuthHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = any>(url: string, body?: any, options?: RequestOptions): Promise<T> =>
    apiRequest<T>(url, {
      ...options,
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(url: string, body?: any, options?: RequestOptions): Promise<T> =>
    apiRequest<T>(url, {
      ...options,
      method: 'PUT',
      headers: getAuthHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = any>(url: string, options?: RequestOptions): Promise<T> =>
    apiRequest<T>(url, { ...options, method: 'DELETE', headers: getAuthHeaders() }),
};

