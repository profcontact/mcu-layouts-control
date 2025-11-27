'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { conferencesAPI, authAPI, Conference } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';

export default function ConferencesPage() {
  const router = useRouter();
  const [conferences, setConferences] = useState<Conference[]>([]);
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
        const data = await conferencesAPI.getList();
        setConferences(data);
      } catch (err: any) {
        // Если ошибка 401, значит токен невалидный - редирект на логин
        if (err.message?.includes('401') || err.message?.includes('авторизации')) {
          authAPI.logout();
          router.push('/login');
          return;
        }
        setError(err.message || 'Ошибка загрузки конференций');
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
          <p className="mt-4 text-gray-600">Загрузка конференций...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-800">Конференции</h1>
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
              className="px-4 py-2 text-sm font-medium text-indigo-600 border-b-2 border-indigo-600"
            >
              Конференции
            </Link>
            <Link
              href="/layouts"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-indigo-600 border-b-2 border-transparent hover:border-indigo-600 transition-colors"
            >
              Раскладки
            </Link>
            <Link
              href="/api-test"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-indigo-600 border-b-2 border-transparent hover:border-indigo-600 transition-colors"
            >
              Тест API
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

        {conferences.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">Конференции не найдены</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {conferences.map((conference) => {
              // Используем conferenceSessionId или conferenceId для навигации
              const conferenceId = conference.conferenceSessionId || conference.conferenceId || conference.id;
              
              return (
                <Link
                  key={conferenceId}
                  href={`/conferences/${conferenceId}`}
                  className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 block"
                >
                  <h2 className="text-xl font-semibold text-gray-800 mb-2">
                    {conference.name}
                  </h2>
                  {conference.description && (
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">{conference.description}</p>
                  )}
                  <div className="space-y-2 text-sm text-gray-600">
                    {conference.startTime && (
                      <div className="flex items-center">
                        <span className="font-medium">Начало:</span>
                        <span className="ml-2">{conference.startTime}</span>
                      </div>
                    )}
                    {conference.ownerName && (
                      <div className="flex items-center">
                        <span className="font-medium">Владелец:</span>
                        <span className="ml-2">{conference.ownerName}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      {conference.status && (
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            conference.status === 'ACTIVE' || conference.status === 'STARTED'
                              ? 'bg-green-100 text-green-800'
                              : conference.status === 'PLANNED'
                              ? 'bg-blue-100 text-blue-800'
                              : conference.status === 'FINISHED'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {conference.status === 'ACTIVE' || conference.status === 'STARTED' ? 'Активна' :
                           conference.status === 'PLANNED' ? 'Запланирована' :
                           conference.status === 'FINISHED' ? 'Завершена' : conference.status}
                        </span>
                      )}
                      {conference.onlineParticipantsCount !== undefined && (
                        <span className="text-gray-500">
                          👥 {conference.onlineParticipantsCount} / {conference.invitedParticipantsCount || 0}
                        </span>
                      )}
                      <span className="text-indigo-600 font-medium">Открыть →</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
