import { NextRequest, NextResponse } from 'next/server';

/**
 * Обработчик для Chrome DevTools запросов
 * Chrome автоматически запрашивает этот файл для расширений разработчика
 * Возвращаем пустой ответ, чтобы убрать 404 из логов
 */
export async function GET(request: NextRequest) {
  // Возвращаем пустой JSON объект
  return NextResponse.json({}, { status: 200 });
}


