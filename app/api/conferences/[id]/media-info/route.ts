import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../../_helpers/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const API_BASE_URL = process.env.API_URL;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let url: string | undefined;
  let authHeaders: Record<string, string> | undefined;
  
  try {
    if (!hasAuth(request)) {
      return NextResponse.json(
        { message: 'Токен авторизации отсутствует' },
        { status: 401 }
      );
    }

    if (!API_BASE_URL) {
      console.error('[Media Info API] API_URL environment variable is not set');
      return NextResponse.json(
        { message: 'Конфигурация сервера не настроена. Обратитесь к администратору.' },
        { status: 500 }
      );
    }

    authHeaders = getAuthHeaders(request);
    url = `${API_BASE_URL}/conference-sessions/${params.id}/media/info`;
    
    const response = await axios.get(url, {
      headers: authHeaders,
    });
    
    return NextResponse.json(response.data);
  } catch (error: any) {
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || error.message || 'Ошибка получения медиа-информации';
    
    console.error('[Media Info API] Error:', {
      message: errorMessage,
      status: statusCode,
      url: url || 'unknown',
      hasAuthHeaders: !!(authHeaders?.['Session'] || authHeaders?.['Authorization']),
      responseData: error.response?.data,
    });
    
    // Для 403 ошибки возвращаем более понятное сообщение
    if (statusCode === 403) {
      return NextResponse.json(
        { 
          message: 'Доступ запрещен. Возможно, у вас нет прав для просмотра медиа-информации этой конференции.',
          details: errorMessage,
          code: 'FORBIDDEN'
        },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { message: errorMessage },
      { status: statusCode }
    );
  }
}

