'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { layoutAPI, authAPI, Layout } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';

export default function LayoutsPage() {
  const router = useRouter();
  const [layouts, setLayouts] = useState<Layout[]>([]);
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
        const data = await layoutAPI.getLayouts();
        setLayouts(data);
      } catch (err: any) {
        // Если ошибка 401, значит токен невалидный - редирект на логин
        if (err.message?.includes('401') || err.message?.includes('авторизации')) {
          authAPI.logout();
          router.push('/login');
          return;
        }
        setError(err.message || 'Ошибка загрузки раскладок');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [router]);

  const handleLogout = () => {
    authAPI.logout();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка раскладок...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-800">Раскладки</h1>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Выйти
            </button>
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

        {layouts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">Раскладки не найдены</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {layouts.map((layout) => (
              <div
                key={layout.layoutId}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
              >
                <div className="flex items-start justify-between mb-2">
                  <h2 className="text-xl font-semibold text-gray-800">
                    {layout.name || `Раскладка ${layout.layoutId}`}
                  </h2>
                  {layout.isSystem && (
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      Системная
                    </span>
                  )}
                </div>
                {layout.description && (
                  <p className="text-gray-600 text-sm mb-4">{layout.description}</p>
                )}
                <div className="space-y-2 mb-4">
                  <div className="text-sm text-gray-500">
                    <span className="font-medium">Тип:</span> {layout.layoutType}
                  </div>
                  <div className="text-sm text-gray-500">
                    <span className="font-medium">Ячеек:</span> {layout.cellCount}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">ID: {layout.layoutId}</span>
                  <Link
                    href={`/layouts/${layout.layoutId}`}
                    className="text-indigo-600 font-medium hover:text-indigo-800 transition-colors"
                  >
                    Подробнее →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

