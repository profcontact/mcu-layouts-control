import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../_helpers/auth';

export const dynamic = 'force-dynamic';

const API_BASE_URL = process.env.API_URL;

export async function GET(request: NextRequest) {
  try {
    if (!hasAuth(request)) {
      return NextResponse.json(
        { message: 'Токен авторизации отсутствует' },
        { status: 401 }
      );
    }

    // Согласно документации API, эндпоинт для получения списка раскладок
    const response = await axios.get(`${API_BASE_URL}/public/system/layouts`, {
      headers: getAuthHeaders(request),
    });

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Get layouts error:', error);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения списка раскладок' },
      { status: error.response?.status || 500 }
    );
  }
}

