import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../../_helpers/auth';

const API_BASE_URL = process.env.API_URL || 'https://ivcs.profcontact.by/api/rest';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('[Participants API] Request for conference:', params.id);
    
    if (!hasAuth(request)) {
      console.error('[Participants API] No auth headers found');
      return NextResponse.json(
        { message: 'Токен авторизации отсутствует' },
        { status: 401 }
      );
    }

    const authHeaders = getAuthHeaders(request);
    console.log('[Participants API] Auth headers:', Object.keys(authHeaders));
    console.log('[Participants API] Session header:', authHeaders['Session'] ? `${authHeaders['Session'].substring(0, 20)}...` : 'missing');
    
    // Добавляем participantFilterType в query параметры
    const url = new URL(`${API_BASE_URL}/conference-sessions/${params.id}/participants/find`);
    url.searchParams.set('participantFilterType', 'CONNECTED_OR_INVITED');
    
    console.log('[Participants API] Requesting:', url.toString());
    
    const response = await axios.get(url.toString(), {
      headers: authHeaders,
    });

    // API возвращает объект с полями data, hasNext, totalCount
    // Извлекаем массив участников из поля data
    const result = response.data;
    console.log('[Participants API] Raw response:', JSON.stringify(result, null, 2));
    
    // Проверяем структуру ответа
    const participantsArray = Array.isArray(result) ? result : (result.data || []);
    
    console.log('[Participants API] Participants array:', participantsArray);
    console.log('[Participants API] Participants count:', participantsArray.length);
    console.log('[Participants API] Response structure:', {
      isArray: Array.isArray(result),
      hasData: !!result.data,
      dataLength: result.data?.length || 0,
      hasNext: result.hasNext,
      totalCount: result.totalCount,
    });
    
    // Получаем sessionId из заголовков для передачи в URL аватара
    // Браузер не отправляет заголовки авторизации при запросе изображений через <img>
    const sessionId = 
      request.headers.get('session') || 
      request.headers.get('Session') ||
      request.headers.get('SESSION') ||
      request.headers.get('x-session') ||
      request.headers.get('X-Session') ||
      request.nextUrl.searchParams.get('session');
    
    // Преобразуем данные участников в формат Participant
    // API возвращает participantId, но интерфейс ожидает id
    const transformedParticipants = participantsArray.map((p: any) => {
      // Формируем URL аватара с sessionId в query параметре для авторизации
      let avatarUrl: string | undefined = undefined;
      if (p.avatarResourceId) {
        avatarUrl = `/api/resources/${p.avatarResourceId}`;
        if (sessionId) {
          avatarUrl += `?session=${encodeURIComponent(sessionId)}`;
        }
      }
      
      const transformed = {
        id: p.participantId || p.id,
        userId: p.profileId || p.userId,
        name: p.name || 'Без имени',
        avatar: avatarUrl,
        roles: p.roles || [], // Роли участника
        isRegisteredUser: p.isRegisteredUser !== undefined ? p.isRegisteredUser : true, // По умолчанию зарегистрированный
        // Сохраняем все остальные поля для возможного использования
        ...p,
      };
      console.log('[Participants API] Transforming participant:', {
        original: { participantId: p.participantId, profileId: p.profileId, name: p.name },
        transformed: { id: transformed.id, userId: transformed.userId, name: transformed.name },
      });
      return transformed;
    });
    
    console.log('[Participants API] Final transformed participants count:', transformedParticipants.length);
    console.log('[Participants API] First participant sample:', transformedParticipants[0] || 'none');
    
    return NextResponse.json(transformedParticipants);
  } catch (error: any) {
    console.error('[Participants API] Error:', error.message);
    console.error('[Participants API] Response:', error.response?.data);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения участников' },
      { status: error.response?.status || 500 }
    );
  }
}

