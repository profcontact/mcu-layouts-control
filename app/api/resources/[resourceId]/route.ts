import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../_helpers/auth';

export const dynamic = 'force-dynamic';

const API_BASE_URL = process.env.API_URL;

export async function GET(
  request: NextRequest,
  { params }: { params: { resourceId: string } }
) {
  try {
    // Для получения ресурсов проверяем авторизацию через заголовки или query параметры
    // Браузер не отправляет заголовки авторизации при запросе изображений через <img>
    let authHeaders = getAuthHeaders(request);
    
    // Если нет заголовков авторизации, пробуем получить sessionId из query параметра
    if (!hasAuth(request)) {
      const sessionFromQuery = request.nextUrl.searchParams.get('session');
      
      if (sessionFromQuery) {
        authHeaders['Session'] = sessionFromQuery;
      } else {
        return NextResponse.json(
          { message: 'Токен авторизации отсутствует' },
          { status: 401 }
        );
      }
    }
    
    // Проксируем запрос к внешнему API для получения ресурса
    const response = await axios.get(`${API_BASE_URL}/resources/${params.resourceId}`, {
      headers: authHeaders,
      responseType: 'arraybuffer', // Для бинарных данных (изображения)
    });

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
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения ресурса' },
      { status: error.response?.status || 500 }
    );
  }
}

