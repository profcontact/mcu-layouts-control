import { NextRequest, NextResponse } from 'next/server';
import { getAuthHeaders, hasAuth } from '../../_helpers/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const API_URL = process.env.API_URL || '';

/**
 * Proxy для WebRTC signalling (HTTP POST метод)
 * Проксирует запросы к /websocket/media/proxy/api/signalling/...
 */
export async function POST(request: NextRequest) {
  try {
    if (!hasAuth(request)) {
      return NextResponse.json(
        { message: 'Токен авторизации отсутствует' },
        { status: 401 }
      );
    }

    if (!API_URL) {
      console.error('[Media Signalling] API_URL environment variable is not set');
      return NextResponse.json(
        { message: 'Конфигурация сервера не настроена' },
        { status: 500 }
      );
    }

    // Получаем полный путь из query параметра
    // ВАЖНО: searchParams.get() автоматически декодирует URL, что может исказить signature
    // Поэтому получаем raw значение из URL строки
    const pathParam = request.nextUrl.searchParams.get('path');
    if (!pathParam) {
      return NextResponse.json(
        { message: 'Path parameter is required' },
        { status: 400 }
      );
    }

    // Проверяем наличие signature в декодированном пути
    const hasSignature = pathParam.includes('signature=');
    
    // Логируем для отладки (в production тоже, чтобы видеть проблему)
    console.log('[Media Signalling] Path param received:', pathParam.substring(0, 200));
    console.log('[Media Signalling] Has signature in path:', hasSignature);
    if (hasSignature) {
      const signatureMatch = pathParam.match(/signature=([^&]+)/);
      if (signatureMatch) {
        console.log('[Media Signalling] Signature found:', signatureMatch[1].substring(0, 50) + '...');
      }
    }

    const authHeaders = getAuthHeaders(request);
    const body = await request.json();

    // Формируем URL к бэкенду
    // Нужно заменить /api/rest на путь signalling
    const baseUrl = API_URL.replace('/api/rest', '');
    // pathParam уже декодирован Next.js, но должен содержать все параметры включая signature
    const backendUrl = `${baseUrl}${pathParam}`;
    
    console.log('[Media Signalling] Final backend URL:', backendUrl.substring(0, 250));

    // Извлекаем signature из URL, если он есть, для возможной передачи в заголовках
    const urlObj = new URL(backendUrl);
    const signature = urlObj.searchParams.get('signature');
    
    // Формируем заголовки
    const fetchHeaders: Record<string, string> = {
      ...authHeaders,
      'Content-Type': 'application/json',
    };
    
    // ВАЖНО: Некоторые бэкенды могут требовать signature в заголовке, а не в URL
    // Попробуем передать signature в заголовке, если он есть
    if (signature) {
      fetchHeaders['X-Signature'] = signature;
      // Также пробуем другие варианты заголовков
      fetchHeaders['Signature'] = signature;
    }
    
    console.log('[Media Signalling] Request headers:', Object.keys(fetchHeaders).join(', '));
    if (signature) {
      console.log('[Media Signalling] Signature in header:', signature.substring(0, 30) + '...');
    }

    // Отправляем POST запрос на бэкенд
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(body),
    });

    // Если ошибка, логируем детали для диагностики
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      console.error('[Media Signalling] Backend error:', {
        status: response.status,
        statusText: response.statusText,
        url: backendUrl.substring(0, 250),
        error: errorText.substring(0, 500),
        hasSignature: backendUrl.includes('signature='),
      });
      
      // Возвращаем ошибку с деталями
      return NextResponse.json(
        { 
          message: errorText || `Backend error: ${response.status} ${response.statusText}`,
          url: backendUrl.substring(0, 200),
        },
        { status: response.status }
      );
    }

    // Возвращаем streaming response для чтения SDP answer и candidates
    // Важно: не буферизуем весь ответ, передаем его потоком
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error: any) {
    console.error('[Media Signalling] Error:', error.message);
    return NextResponse.json(
      { message: error.message || 'Ошибка проксирования signalling' },
      { status: 500 }
    );
  }
}

