import { NextRequest, NextResponse } from 'next/server';
import { getAuthHeaders, hasAuth } from '../../_helpers/auth';

const API_URL = process.env.API_URL || '';

/**
 * Proxy для WebRTC signalling (HTTP POST метод)
 * Проксирует запросы к /websocket/media/proxy/api/signalling/...
 */
export async function POST(request: NextRequest) {
  try {
    if (!hasAuth(request)) {
      return NextResponse.json(
        { message: 'Токен авторизации отсутствует' },
        { status: 401 }
      );
    }

    if (!API_URL) {
      console.error('[Media Signalling] API_URL environment variable is not set');
      return NextResponse.json(
        { message: 'Конфигурация сервера не настроена' },
        { status: 500 }
      );
    }

    // Получаем полный путь из query параметра
    const fullPath = request.nextUrl.searchParams.get('path');
    if (!fullPath) {
      return NextResponse.json(
        { message: 'Path parameter is required' },
        { status: 400 }
      );
    }

    const authHeaders = getAuthHeaders(request);
    const body = await request.json();

    // Формируем URL к бэкенду
    // Нужно заменить /api/rest на путь signalling
    const baseUrl = API_URL.replace('/api/rest', '');
    const backendUrl = `${baseUrl}${fullPath}`;

    // Отправляем POST запрос на бэкенд
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Возвращаем streaming response для чтения SDP answer и candidates
    // Важно: не буферизуем весь ответ, передаем его потоком
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error: any) {
    console.error('[Media Signalling] Error:', error.message);
    return NextResponse.json(
      { message: error.message || 'Ошибка проксирования signalling' },
      { status: 500 }
    );
  }
}

