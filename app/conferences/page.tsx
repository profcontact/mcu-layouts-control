'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { conferencesAPI, authAPI, Conference } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import { logger } from '@/lib/logger';

export default function ConferencesPage() {
  const router = useRouter();
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedConference, setSelectedConference] = useState<Conference | null>(null);

  useEffect(() => {
    logger.effect('ConferencesPage', 'useEffect triggered');
    
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      try {
        logger.loading('ConferencesPage', 'Loading conferences...');
        const data = await conferencesAPI.getList();
        
        if (!isMounted) {
          logger.abort('ConferencesPage', 'Component unmounted, skipping state update');
          return;
        }
        
        setConferences(data);
        setLoading(false);
        logger.success('ConferencesPage', 'Data loaded successfully');
      } catch (err: any) {
        if (!isMounted) {
          logger.abort('ConferencesPage', 'Component unmounted during error');
          return;
        }

        if (err.message?.includes('401') || err.message?.includes('авторизации')) {
          logger.error('ConferencesPage', 'Auth error, redirecting to login');
          authAPI.logout();
          router.push('/login');
          return;
        }
        
        logger.error('ConferencesPage', 'Error loading data:', err.message);
        setError(err.message || 'Ошибка загрузки конференций');
        setLoading(false);
      }
    };

    loadData();

    return () => {
      logger.cleanup('ConferencesPage', 'Component unmounted');
      isMounted = false;
    };
  }, [router]);

  const handleLogout = () => {
    authAPI.logout();
    router.push('/login');
  };

  const handleConferenceClick = (conference: Conference) => {
    setSelectedConference(conference);
  };

  const handleJoinConference = () => {
    if (!selectedConference) return;
    const conferenceId = selectedConference.conferenceSessionId || selectedConference.conferenceId || selectedConference.id;
    router.push(`/conferences/${conferenceId}`);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'STARTED':
        return 'text-green-500';
      case 'PLANNED':
        return 'text-blue-500';
      case 'FINISHED':
        return 'text-gray-400';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'STARTED':
        return 'Активна';
      case 'PLANNED':
        return 'Запланирована';
      case 'FINISHED':
        return 'Завершена';
      default:
        return status || '';
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Левая боковая панель */}
      <div className="w-16 bg-[#1a1f3a] flex flex-col items-center py-4 space-y-6">
        {/* Логотип */}
        <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
          C
        </div>
        
        {/* Навигация */}
        <nav className="flex-1 flex flex-col items-center space-y-4">
          <button className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-400 hover:bg-[#252b47] hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
          
          <button className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          
          <button className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-400 hover:bg-[#252b47] hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </button>
        </nav>
        
        {/* Настройки и выход */}
        <div className="space-y-4">
          <button className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-400 hover:bg-[#252b47] hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          
          <button
            onClick={handleLogout}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-600 hover:text-white transition-colors"
            title="Выйти"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Средняя панель - список конференций */}
      <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
        {/* Заголовок */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-800">Конференции</h1>
            <div className="flex space-x-2">
              <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              <button className="p-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Список конференций */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-600">{error}</div>
          ) : conferences.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>Конференции не найдены</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {conferences.map((conference) => {
                const conferenceId = conference.conferenceSessionId || conference.conferenceId || conference.id;
                const selectedId = selectedConference?.conferenceSessionId || selectedConference?.conferenceId || selectedConference?.id;
                const isSelected = selectedId === conferenceId;
                
                return (
                  <button
                    key={conferenceId}
                    onClick={() => handleConferenceClick(conference)}
                    className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-lg">
                        {conference.name.charAt(0).toUpperCase()}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">
                            {conference.name}
                          </h3>
                          {conference.startTime && (
                            <span className="text-xs text-gray-500 ml-2">
                              {new Date(conference.startDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                        
                        {conference.ownerName && (
                          <p className="text-sm text-gray-600 truncate mb-1">
                            {conference.ownerName}
                          </p>
                        )}
                        
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-medium ${getStatusColor(conference.status)}`}>
                            {getStatusText(conference.status)}
                          </span>
                          
                          {conference.onlineParticipantsCount !== undefined && (
                            <div className="flex items-center space-x-1 text-xs text-gray-500">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              <span>{conference.onlineParticipantsCount} / {conference.invitedParticipantsCount || 0}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Правая панель - детали конференции или пустое состояние */}
      <div className="flex-1 bg-gray-50 overflow-y-auto">
        {selectedConference ? (
          <div className="max-w-4xl mx-auto p-8">
            {/* Заголовок конференции */}
            <div className="bg-white rounded-2xl shadow-sm p-8 mb-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-start space-x-4">
                  <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 font-bold text-2xl flex-shrink-0">
                    {selectedConference.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                      {selectedConference.name}
                    </h1>
                    {selectedConference.description && (
                      <p className="text-gray-600 text-lg">
                        {selectedConference.description}
                      </p>
                    )}
                  </div>
                </div>
                
                <span className={`px-4 py-2 rounded-lg font-semibold ${
                  selectedConference.status === 'ACTIVE' || selectedConference.status === 'STARTED'
                    ? 'bg-green-100 text-green-700'
                    : selectedConference.status === 'PLANNED'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {getStatusText(selectedConference.status)}
                </span>
              </div>

              <button
                onClick={handleJoinConference}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center space-x-2 text-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Войти в конференцию</span>
              </button>
            </div>

            {/* Информация о конференции */}
            <div className="bg-white rounded-2xl shadow-sm p-8 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Информация</h2>
              
              <div className="space-y-4">
                {selectedConference.ownerName && (
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Организатор</p>
                      <p className="font-semibold text-gray-900">{selectedConference.ownerName}</p>
                    </div>
                  </div>
                )}

                {selectedConference.startTime && (
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Время начала</p>
                      <p className="font-semibold text-gray-900">{selectedConference.startTime}</p>
                    </div>
                  </div>
                )}

                {selectedConference.endTime && (
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Время окончания</p>
                      <p className="font-semibold text-gray-900">{selectedConference.endTime}</p>
                    </div>
                  </div>
                )}

                {selectedConference.createDate && (
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Дата создания</p>
                      <p className="font-semibold text-gray-900">
                        {new Date(selectedConference.createDate).toLocaleString('ru-RU')}
                      </p>
                    </div>
                  </div>
                )}

                {selectedConference.actualStartDate && (
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Фактическое начало</p>
                      <p className="font-semibold text-gray-900">
                        {new Date(selectedConference.actualStartDate).toLocaleString('ru-RU')}
                      </p>
                    </div>
                  </div>
                )}

                {selectedConference.sessionNumber !== undefined && (
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Номер сессии</p>
                      <p className="font-semibold text-gray-900">#{selectedConference.sessionNumber}</p>
                    </div>
                  </div>
                )}

                {selectedConference.lastMediaSessionStartDate && (
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Последняя медиа-сессия</p>
                      <p className="font-semibold text-gray-900">
                        {new Date(selectedConference.lastMediaSessionStartDate).toLocaleString('ru-RU')}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Участники</p>
                    <p className="font-semibold text-gray-900">
                      {selectedConference.onlineParticipantsCount || 0} онлайн / {selectedConference.invitedParticipantsCount || 0} приглашено
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Дополнительные настройки */}
            <div className="bg-white rounded-2xl shadow-sm p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Настройки</h2>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="font-medium text-gray-900">Камера</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <span className="font-medium text-gray-900">Микрофон</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <span className="font-medium text-gray-900">Уведомления</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md px-4">
              <div className="mb-6 flex justify-center">
                <div className="relative">
                  <div className="w-32 h-32 bg-indigo-100 rounded-2xl flex items-center justify-center">
                    <svg className="w-16 h-16 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="absolute -bottom-2 -left-2 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Выберите конференцию
              </h2>
              <p className="text-gray-600">
                Выберите конференцию из списка слева, чтобы присоединиться и посмотреть информацию о ней
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
