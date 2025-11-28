import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../../_helpers/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
    const response = await axios.get(`${API_BASE_URL}/conference-sessions/${params.id}/layout`, {
      headers: authHeaders,
    });

    return NextResponse.json(response.data);
  } catch (error: any) {
    // console.error('Get layout error:', error);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения раскладки' },
      { status: error.response?.status || 500 }
    );
  }
}

export async function PUT(
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

    const response = await axios.put(
      `${API_BASE_URL}/conference-sessions/${params.id}/layout`,
      body,
      {
        headers: authHeaders,
      }
    );

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Update layout error:', error);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка обновления раскладки' },
      { status: error.response?.status || 500 }
    );
  }
}

