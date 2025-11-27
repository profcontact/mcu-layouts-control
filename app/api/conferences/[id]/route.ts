import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../_helpers/auth';

const API_BASE_URL = process.env.API_URL || 'https://ivcs.profcontact.by/api/rest';

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
    const response = await axios.get(`${API_BASE_URL}/conference-sessions/${params.id}`, {
      headers: authHeaders,
    });

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Get conference error:', error);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения конференции' },
      { status: error.response?.status || 500 }
    );
  }
}

export async function PATCH(
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

    const response = await axios.patch(
      `${API_BASE_URL}/conference-sessions/${params.id}`,
      body,
      {
        headers: authHeaders,
      }
    );

    // PATCH может вернуть 204 No Content или данные
    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Update conference session error:', error);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка обновления конференции' },
      { status: error.response?.status || 500 }
    );
  }
}

