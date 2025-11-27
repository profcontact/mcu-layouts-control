import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'https://ivcs.profcontact.by/api';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json(
        { message: 'Токен авторизации отсутствует' },
        { status: 401 }
      );
    }

    const response = await axios.get(`${API_BASE_URL}/auth/me`, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения пользователя' },
      { status: error.response?.status || 500 }
    );
  }
}

