import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const API_BASE_URL = process.env.API_URL;

// Проверка переменных окружения при загрузке модуля (только в dev режиме)
if (process.env.NODE_ENV === 'development' && !API_BASE_URL) {
  console.error('[Login API] ⚠️  WARNING: API_URL environment variable is not set!');
  console.error('[Login API] Make sure .env.local file exists in the project root with API_URL variable');
  console.error('[Login API] File location should be: .env.local');
  console.error('[Login API] Required format: API_URL=https://your-api-url/api/rest');
}

export async function POST(request: NextRequest) {
  try {
    if (!API_BASE_URL) {
      console.error('[Login API] API_URL environment variable is not set');
      return NextResponse.json(
        { message: 'Конфигурация сервера не настроена. Обратитесь к администратору.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { login, password } = body;

    // Проверяем, что URL валидный
    const loginUrl = `${API_BASE_URL}/login`;
    try {
      new URL(loginUrl);
    } catch (urlError) {
      console.error('[Login API] Invalid API_URL:', API_BASE_URL);
      return NextResponse.json(
        { message: 'Неверная конфигурация API сервера. Обратитесь к администратору.' },
        { status: 500 }
      );
    }

    const response = await axios.post(loginUrl, {
      login,
      password,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('[Login API] Login error:', error);
    
    // Более детальная обработка ошибок
    if (error.code === 'ERR_INVALID_URL') {
      console.error('[Login API] Invalid URL error. API_URL:', API_BASE_URL);
      return NextResponse.json(
        { message: 'Неверная конфигурация API сервера. Проверьте переменную окружения API_URL.' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка авторизации' },
      { status: error.response?.status || 500 }
    );
  }
}

