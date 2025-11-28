import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../_helpers/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const API_BASE_URL = process.env.API_URL;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ layoutId: string }> }
) {
  try {
    if (!hasAuth(request)) {
      return NextResponse.json(
        { message: 'Токен авторизации отсутствует' },
        { status: 401 }
      );
    }
    const { layoutId } = await params;
    // Получаем настройки раскладки по ID
    const response = await axios.get(`${API_BASE_URL}/system/layouts/${layoutId}`, {
      headers: getAuthHeaders(request),
    });

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Get layout details error:', error);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения настроек раскладки' },
      { status: error.response?.status || 500 }
    );
  }
}

