import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../../_helpers/auth';

export const dynamic = 'force-dynamic';

const API_BASE_URL = process.env.API_URL;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!hasAuth(request)) {
      return NextResponse.json(
        { message: 'Токен авторизации отсутствует' },
        { status: 401 }
      );
    }

    if (!API_BASE_URL) {
      return NextResponse.json(
        { message: 'Конфигурация сервера не настроена' },
        { status: 500 }
      );
    }

    const authHeaders = getAuthHeaders(request);
    const url = `${API_BASE_URL}/conference-sessions/${params.id}/leave`;
    
    // Отправляем POST запрос с пустым телом
    await axios.post(url, {}, {
      headers: authHeaders,
    });
    
    // Возвращаем 204 No Content при успехе
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || error.message || 'Ошибка при выходе из конференции';
    
    return NextResponse.json(
      { message: errorMessage },
      { status: statusCode }
    );
  }
}

