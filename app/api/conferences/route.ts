import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../_helpers/auth';

const API_BASE_URL = process.env.API_URL || 'https://ivcs.profcontact.by/api/rest';

export async function GET(request: NextRequest) {
  try {
    if (!hasAuth(request)) {
      return NextResponse.json(
        { message: 'Токен авторизации отсутствует' },
        { status: 401 }
      );
    }

    // Используем метод Find conference sessions вместо /conferences-sessions/rooms
    // GET /conference-sessions/sessions - Find conference sessions
    const response = await axios.get(`${API_BASE_URL}/conference-sessions/rooms`, {
      headers: getAuthHeaders(request),
      params: {
        limit: 100, // Максимальное количество результатов
        orderAsc: false, // Сортировка по убыванию даты (новые сначала)
      },
    });
    console.log(response.data);

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Get conferences error:', error);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения конференций' },
      { status: error.response?.status || 500 }
    );
  }
}

