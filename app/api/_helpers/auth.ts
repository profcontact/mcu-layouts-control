import { NextRequest } from 'next/server';

/**
 * Получает заголовки авторизации из запроса
 * Поддерживает два способа авторизации:
 * 1. IvcsAuthSession - sessionId в заголовке Session
 * 2. JWTAuth - JWT токен в заголовке Authorization с Bearer
 */
export function getAuthHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Проверяем заголовки в разных регистрах (Next.js может нормализовать их)
  const sessionHeader = 
    request.headers.get('session') || 
    request.headers.get('Session') ||
    request.headers.get('SESSION') ||
    request.headers.get('x-session') ||
    request.headers.get('X-Session');
  const authHeader = 
    request.headers.get('authorization') || 
    request.headers.get('Authorization') ||
    request.headers.get('AUTHORIZATION');

  // Приоритет: Session header (IvcsAuthSession)
  // Пробуем оба варианта регистра, так как некоторые серверы чувствительны к регистру
  if (sessionHeader) {
    headers['Session'] = sessionHeader;
    headers['session'] = sessionHeader; // Также пробуем lowercase
  }
  // Если нет Session, используем Authorization (JWTAuth)
  else if (authHeader) {
    headers['Authorization'] = authHeader;
  } else {
    // Пробуем получить из query параметров как fallback
    const sessionFromQuery = request.nextUrl.searchParams.get('session');
    if (sessionFromQuery) {
      headers['Session'] = sessionFromQuery;
    }
  }

  return headers;
}

/**
 * Проверяет наличие авторизации в запросе
 */
export function hasAuth(request: NextRequest): boolean {
  // Проверяем заголовки в разных регистрах
  const sessionHeader = 
    request.headers.get('session') || 
    request.headers.get('Session') ||
    request.headers.get('SESSION') ||
    request.headers.get('x-session') ||
    request.headers.get('X-Session');
  const authHeader = 
    request.headers.get('authorization') || 
    request.headers.get('Authorization') ||
    request.headers.get('AUTHORIZATION');
  
  return !!(sessionHeader || authHeader);
}

