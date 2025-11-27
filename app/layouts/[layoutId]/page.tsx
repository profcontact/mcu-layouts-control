'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { layoutAPI, authAPI } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';

export default function LayoutDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const layoutId = params.layoutId as string;

  const [layoutDetails, setLayoutDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Проверяем авторизацию синхронно
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    const loadData = async () => {
      try {
        const data = await layoutAPI.getLayoutById(Number(layoutId));
        setLayoutDetails(data);
      } catch (err: any) {
        // Если ошибка 401, значит токен невалидный - редирект на логин
        if (err.message?.includes('401') || err.message?.includes('авторизации')) {
          authAPI.logout();
          router.push('/login');
          return;
        }
        setError(err.message || 'Ошибка загрузки настроек раскладки');
      } finally {
        setLoading(false);
      }
    };

    if (layoutId) {
      loadData();
    }
  }, [layoutId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка настроек раскладки...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <button
                onClick={() => router.push('/layouts')}
                className="text-indigo-600 hover:text-indigo-800 mb-2"
              >
                ← Назад к раскладкам
              </button>
              <h1 className="text-2xl font-bold text-gray-800">
                Настройки раскладки
              </h1>
            </div>
          </div>
          <nav className="flex space-x-4 border-b border-gray-200">
            <Link
              href="/conferences"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-indigo-600 border-b-2 border-transparent hover:border-indigo-600 transition-colors"
            >
              Конференции
            </Link>
            <Link
              href="/layouts"
              className="px-4 py-2 text-sm font-medium text-indigo-600 border-b-2 border-indigo-600"
            >
              Раскладки
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {layoutDetails && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              {layoutDetails.name || `Раскладка ${layoutId}`}
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ID раскладки
                  </label>
                  <p className="text-gray-900">{layoutDetails.layoutId || layoutId}</p>
                </div>

                {layoutDetails.layoutType && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Тип раскладки
                    </label>
                    <p className="text-gray-900">{layoutDetails.layoutType}</p>
                  </div>
                )}

                {layoutDetails.cellCount !== undefined && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Количество ячеек
                    </label>
                    <p className="text-gray-900">{layoutDetails.cellCount}</p>
                  </div>
                )}

                {layoutDetails.isSystem !== undefined && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Тип
                    </label>
                    <p className="text-gray-900">
                      {layoutDetails.isSystem ? 'Системная' : 'Пользовательская'}
                    </p>
                  </div>
                )}
              </div>

              {layoutDetails.description && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Описание
                  </label>
                  <p className="text-gray-900">{layoutDetails.description}</p>
                </div>
              )}

              {/* Отображаем все остальные поля из ответа API */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  Детальная информация
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <pre className="text-sm text-gray-700 overflow-auto">
                    {JSON.stringify(layoutDetails, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

