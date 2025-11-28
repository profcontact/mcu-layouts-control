import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../../_helpers/auth';

const API_BASE_URL = process.env.API_URL;

export async function GET(
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

    const authHeaders = getAuthHeaders(request);
    const url = `${API_BASE_URL}/conference-sessions/${params.id}/media/info`;
    
    const response = await axios.get(url, {
      headers: authHeaders,
    });
    
    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('[Media Info API] Error:', error.message);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения медиа-информации' },
      { status: error.response?.status || 500 }
    );
  }
}

