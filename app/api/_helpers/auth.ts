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

  // Логируем все заголовки для отладки
  const allHeaderKeys: string[] = [];
  request.headers.forEach((_, key) => {
    allHeaderKeys.push(key);
  });
  console.log('All header keys received:', allHeaderKeys);

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

  console.log('Received headers - session:', sessionHeader ? `${sessionHeader.substring(0, 20)}...` : 'missing');
  console.log('Received headers - authorization:', authHeader ? `${authHeader.substring(0, 20)}...` : 'missing');

  // Приоритет: Session header (IvcsAuthSession)
  // Пробуем оба варианта регистра, так как некоторые серверы чувствительны к регистру
  if (sessionHeader) {
    headers['Session'] = sessionHeader;
    headers['session'] = sessionHeader; // Также пробуем lowercase
    console.log('Using Session header for auth');
  }
  // Если нет Session, используем Authorization (JWTAuth)
  else if (authHeader) {
    headers['Authorization'] = authHeader;
    console.log('Using Authorization header for auth');
  } else {
    console.warn('No auth headers found in request');
    // Пробуем получить из query параметров как fallback
    const sessionFromQuery = request.nextUrl.searchParams.get('session');
    if (sessionFromQuery) {
      headers['Session'] = sessionFromQuery;
      console.log('Using Session from query parameter');
    }
  }

  console.log('Final headers to send:', Object.keys(headers));
  console.log('Session header value:', headers['Session'] ? `${headers['Session'].substring(0, 20)}...` : 'none');

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

