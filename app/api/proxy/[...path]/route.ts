import { NextRequest, NextResponse } from 'next/server';
import { getAuthHeaders } from '../../_helpers/auth';

export const dynamic = 'force-dynamic';

const API_BASE_URL = process.env.API_URL;

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleRequest(request, params, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleRequest(request, params, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleRequest(request, params, 'PUT');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleRequest(request, params, 'PATCH');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleRequest(request, params, 'DELETE');
}

async function handleRequest(
  request: NextRequest,
  params: { path: string[] },
  method: string
) {
  try {
    // Собираем путь из параметров
    const path = '/' + params.path.join('/');
    const url = `${API_BASE_URL}${path}`;

    // Получаем query параметры
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;

    // Получаем заголовки авторизации
    const authHeaders = getAuthHeaders(request);

    // Получаем body для POST, PUT, PATCH
    let body = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        body = await request.json();
      } catch {
        // Body может быть пустым
      }
    }

    // Убеждаемся, что заголовок Session передается с правильным регистром
    // Согласно OpenAPI спецификации, заголовок должен быть именно "Session" (с большой буквы)
    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Копируем все заголовки из authHeaders, но приоритет Session с большой буквы
    if (authHeaders['Session']) {
      finalHeaders['Session'] = authHeaders['Session'];
    } else if (authHeaders['session']) {
      finalHeaders['Session'] = authHeaders['session'];
    }
    
    if (authHeaders['Authorization']) {
      finalHeaders['Authorization'] = authHeaders['Authorization'];
    } else if (authHeaders['authorization']) {
      finalHeaders['Authorization'] = authHeaders['authorization'];
    }

    try {
      // Используем нативный fetch, который лучше сохраняет регистр заголовков
      // Создаем Headers объект для явного контроля регистра
      const fetchHeaders = new Headers();
      fetchHeaders.set('Content-Type', 'application/json');
      
      // Явно устанавливаем Session с большой буквы
      if (finalHeaders['Session']) {
        // Используем set с явным указанием имени заголовка
        fetchHeaders.set('Session', finalHeaders['Session']);
      }
      
      if (finalHeaders['Authorization']) {
        fetchHeaders.set('Authorization', finalHeaders['Authorization']);
      }

      const fetchResponse = await fetch(fullUrl, {
        method: method,
        headers: fetchHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      const responseData = await fetchResponse.json().catch(() => ({}));

      if (!fetchResponse.ok) {
        return NextResponse.json(
          {
            message: responseData.message || 'Ошибка выполнения запроса',
            error: responseData,
          },
          { status: fetchResponse.status }
        );
      }

      return NextResponse.json(responseData, { status: fetchResponse.status });
    } catch (fetchError: any) {
      console.error('API Fetch Error:', fetchError.message);
      
      return NextResponse.json(
        {
          message: fetchError.message || 'Ошибка выполнения запроса',
          error: fetchError,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error(`API proxy error (${method}):`, error);
    return NextResponse.json(
      {
        message: error.response?.data?.message || 'Ошибка выполнения запроса',
        error: error.response?.data,
      },
      { status: error.response?.status || 500 }
    );
  }
}

