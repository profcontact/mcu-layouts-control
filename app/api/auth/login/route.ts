import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'https://ivcs.profcontact.by/api/rest';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { login, password } = body;

    const response = await axios.post(`${API_BASE_URL}/login`, {
      login,
      password,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка авторизации' },
      { status: error.response?.status || 500 }
    );
  }
}

