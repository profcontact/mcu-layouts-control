import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../../_helpers/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const API_BASE_URL = process.env.API_URL;

// Проверка переменных окружения при загрузке модуля (только в dev режиме)
if (process.env.NODE_ENV === 'development' && !API_BASE_URL) {
  console.error('[Join API] ⚠️  WARNING: API_URL environment variable is not set!');
  console.error('[Join API] Make sure .env.local file exists in the project root with API_URL variable');
  console.error('[Join API] File location should be: .env.local');
  console.error('[Join API] Required format: API_URL=https://your-api-url/api/rest');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    if (!API_BASE_URL) {
      console.error('[Join API] API_URL environment variable is not set');
      return NextResponse.json(
        { message: 'Конфигурация сервера не настроена. Обратитесь к администратору.' },
        { status: 500 }
      );
    }

    if (!hasAuth(request)) {
      return NextResponse.json(
        { message: 'Токен авторизации отсутствует' },
        { status: 401 }
      );
    }

    const authHeaders = getAuthHeaders(request);
    const body = await request.json();

    const response = await axios.post(
      `${API_BASE_URL}/conference-sessions/${id}/join`,
      body,
      {
        headers: authHeaders,
      }
    );

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Join conference session error:', error);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка присоединения к конференции' },
      { status: error.response?.status || 500 }
    );
  }
}

