import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../_helpers/auth';

const API_BASE_URL = process.env.API_URL || 'https://ivcs.profcontact.by/api/rest';

export async function GET(
  request: NextRequest,
  { params }: { params: { layoutId: string } }
) {
  try {
    if (!hasAuth(request)) {
      return NextResponse.json(
        { message: 'Токен авторизации отсутствует' },
        { status: 401 }
      );
    }
    console.log(getAuthHeaders(request));
    // Получаем настройки раскладки по ID
    const response = await axios.get(`${API_BASE_URL}/system/layouts/${params.layoutId}`, {
      headers: getAuthHeaders(request),
    });

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Get layout details error:');
    console.log("Response data:",error.response?.data);
    console.log("Response status:",error.response?.status);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения настроек раскладки' },
      { status: error.response?.status || 500 }
    );
  }
}

