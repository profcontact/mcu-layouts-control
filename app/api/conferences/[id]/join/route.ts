import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../../_helpers/auth';

const API_BASE_URL = process.env.API_URL || 'https://ivcs.profcontact.by/api/rest';

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

    const authHeaders = getAuthHeaders(request);
    const body = await request.json();

    const response = await axios.post(
      `${API_BASE_URL}/conference-sessions/${params.id}/join`,
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

