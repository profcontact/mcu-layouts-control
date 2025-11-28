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
    
    // Добавляем participantFilterType в query параметры
    const url = new URL(`${API_BASE_URL}/conference-sessions/${params.id}/participants/find`);
    url.searchParams.set('participantFilterType', 'CONNECTED_OR_INVITED');
    
    const response = await axios.get(url.toString(), {
      headers: authHeaders,
    });

    // API возвращает объект с полями data, hasNext, totalCount
    // Извлекаем массив участников из поля data
    const result = response.data;
    
    // Проверяем структуру ответа
    const participantsArray = Array.isArray(result) ? result : (result.data || []);
    
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
      
      return {
        id: p.participantId || p.id,
        userId: p.profileId || p.userId,
        name: p.name || 'Без имени',
        avatar: avatarUrl,
        roles: p.roles || [], // Роли участника
        isRegisteredUser: p.isRegisteredUser !== undefined ? p.isRegisteredUser : true, // По умолчанию зарегистрированный
        // Сохраняем все остальные поля для возможного использования
        ...p,
      };
    });
    
    return NextResponse.json(transformedParticipants);
  } catch (error: any) {
    console.error('[Participants API] Error:', error.message);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения участников' },
      { status: error.response?.status || 500 }
    );
  }
}

