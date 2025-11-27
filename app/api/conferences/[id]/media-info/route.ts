import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getAuthHeaders, hasAuth } from '../../../_helpers/auth';

const API_BASE_URL = process.env.API_URL || 'https://ivcs.profcontact.by/api/rest';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('[Media Info API] Request for conference:', params.id);
    
    if (!hasAuth(request)) {
      console.error('[Media Info API] No auth headers found');
      return NextResponse.json(
        { message: 'Токен авторизации отсутствует' },
        { status: 401 }
      );
    }

    const authHeaders = getAuthHeaders(request);
    console.log('[Media Info API] Auth headers:', Object.keys(authHeaders));
    
    const url = `${API_BASE_URL}/conference-sessions/${params.id}/media/info`;
    
    console.log('[Media Info API] Requesting:', url);
    
    const response = await axios.get(url, {
      headers: authHeaders,
    });

    console.log('[Media Info API] Response received');
    
    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('[Media Info API] Error:', error.message);
    console.error('[Media Info API] Response:', error.response?.data);
    return NextResponse.json(
      { message: error.response?.data?.message || 'Ошибка получения медиа-информации' },
      { status: error.response?.status || 500 }
    );
  }
}

