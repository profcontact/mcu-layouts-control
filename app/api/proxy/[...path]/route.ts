import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../_helpers/auth';

const API_BASE_URL = process.env.API_URL || 'https://ivcs.profcontact.by/api/rest';

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

    // Логируем все заголовки для отладки
    const allHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      allHeaders[key] = value;
    });
    console.log('All incoming headers:', allHeaders);

    // Получаем заголовки авторизации
    const authHeaders = getAuthHeaders(request);
    console.log('Proxy request headers to API:', authHeaders);
    console.log('Request URL:', fullUrl);

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
    
    console.log('Final headers being sent to API:', finalHeaders);
    console.log('Session header value:', finalHeaders['Session'] ? `${finalHeaders['Session'].substring(0, 20)}...` : 'missing');

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

      console.log('Fetch headers being sent:', Object.fromEntries(fetchHeaders.entries()));

      const fetchResponse = await fetch(fullUrl, {
        method: method,
        headers: fetchHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      const responseData = await fetchResponse.json().catch(() => ({}));

      console.log('API Response Status:', fetchResponse.status);
      console.log('API Response OK:', fetchResponse.ok);
      console.log('API Response Data:', responseData);

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
      console.error('API Fetch Error:');
      console.error('Error message:', fetchError.message);
      console.error('Headers sent:', finalHeaders);
      
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
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.response?.status);
    return NextResponse.json(
      {
        message: error.response?.data?.message || 'Ошибка выполнения запроса',
        error: error.response?.data,
      },
      { status: error.response?.status || 500 }
    );
  }
}

