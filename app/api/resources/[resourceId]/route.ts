import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../_helpers/auth';

const API_BASE_URL = process.env.API_URL || 'https://ivcs.profcontact.by/api';

export async function GET(
  request: NextRequest,
  { params }: { params: { resourceId: string } }
) {
  try {
    console.log('[Resources API] Request received for resourceId:', params.resourceId);
    console.log('[Resources API] Request URL:', request.url);
    console.log('[Resources API] Query params:', request.nextUrl.searchParams.toString());
    
    // Для получения ресурсов проверяем авторизацию через заголовки или query параметры
    // Браузер не отправляет заголовки авторизации при запросе изображений через <img>
    let authHeaders = getAuthHeaders(request);
    
    // Если нет заголовков авторизации, пробуем получить sessionId из query параметра
    if (!hasAuth(request)) {
      const sessionFromQuery = request.nextUrl.searchParams.get('session');
      
      if (sessionFromQuery) {
        authHeaders['Session'] = sessionFromQuery;
        console.log('[Resources API] Using session from query parameter');
      } else {
        console.error('[Resources API] No auth headers and no session in query');
        return NextResponse.json(
          { message: 'Токен авторизации отсутствует' },
          { status: 401 }
        );
      }
    }
    
    console.log('[Resources API] Requesting external API:', `${API_BASE_URL}/rest/resources/${params.resourceId}`);
    console.log('[Resources API] Auth headers:', Object.keys(authHeaders));
    
    // Проксируем запрос к внешнему API для получения ресурса
    // Используем эндпоинт для получения ресурса по ID: https://ivcs.profcontact.by/api/resources/{resourceId}
    const response = await axios.get(`${API_BASE_URL}/rest/resources/${params.resourceId}`, {
      headers: authHeaders,
      responseType: 'arraybuffer', // Для бинарных данных (изображения)
    });
    
    console.log('[Resources API] External API response status:', response.status);
    console.log('[Resources API] Content-Type:', response.headers['content-type']);

    // Определяем Content-Type из заголовков ответа или используем image/jpeg по умолчанию
    const contentType = response.headers['content-type'] || 'image/jpeg';
    
    // Возвращаем бинарные данные с правильным Content-Type
    return new NextResponse(response.data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Кэшируем на 1 час
      },
    });
  } catch (error: any) {
    console.error('[Resources API] Error:', error.message);
    console.error('[Resources API] Response:', error.response?.data);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения ресурса' },
      { status: error.response?.status || 500 }
    );
  }
}

