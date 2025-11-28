'use client';

import { useDrag } from 'react-dnd';
import { Participant, Layout } from '@/lib/api';

interface ParticipantListProps {
  participants: Participant[];
  layouts: Layout[];
  selectedLayoutId: number | null;
  setSelectedLayoutId: (id: number | null) => void;
  showNames: boolean;
  setShowNames: (show: boolean) => void;
  hasUnsavedChanges: boolean;
  applying: boolean;
  handleApply: () => void;
}

export default function ParticipantList({ 
  participants,
  layouts,
  selectedLayoutId,
  setSelectedLayoutId,
  showNames,
  setShowNames,
  hasUnsavedChanges,
  applying,
  handleApply,
}: ParticipantListProps) {
  return (
    <div className="flex flex-col h-full text-white">
      {/* Заголовок панели */}
      <div className="px-4 py-3 border-b border-[#2a2f4a] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-sm font-medium">Подключены ({participants.length})</span>
        </div>
        <div className="flex items-center space-x-2">
          <button className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <button className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Список участников */}
      <div className="flex-1 overflow-y-auto">
        {participants.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            Нет участников
          </div>
        ) : (
          <div className="py-2">
            {participants.map((participant, index) => (
              <ParticipantItem 
                key={participant.id || `participant-${index}`} 
                participant={participant} 
              />
            ))}
          </div>
        )}
      </div>

      {/* Панель управления раскладкой */}
      <div className="border-t border-[#2a2f4a] p-4 bg-[#0f1322]">
        <div className="flex flex-col space-y-3">
          <div>
            <label className="block text-xs text-gray-300 mb-2">Раскладка</label>
            <select
              value={selectedLayoutId || ''}
              onChange={(e) => setSelectedLayoutId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 bg-[#1a1f3a] border border-[#2a2f4a] rounded text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">-- Выберите --</option>
              {layouts.map((layout) => (
                <option key={layout.layoutId} value={layout.layoutId}>
                  {layout.name} ({layout.cellCount} ячеек)
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showNames}
              onChange={(e) => setShowNames(e.target.checked)}
              className="mr-2"
            />
            Показывать имена
          </label>
          {hasUnsavedChanges && (
            <div className="text-xs text-orange-400">Есть несохраненные изменения</div>
          )}
          <button
            onClick={handleApply}
            disabled={!selectedLayoutId || applying}
            className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
          >
            {applying ? 'Применение...' : 'Применить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Функция для получения текстового представления роли
function getRoleLabel(roles: string[]): string {
  const roleLabels: Record<string, string> = {
    'MODERATOR': 'Модератор',
    'SPEAKER': 'Докладчик',
    'ATTENDEE': 'Участник',
    'ORGANIZER': 'Организатор',
  };
  
  // Если есть несколько ролей, показываем их через запятую
  return roles
    .map(role => roleLabels[role] || role)
    .join(', ');
}

function ParticipantItem({ participant }: { participant: Participant }) {
  const [{ isDragging }, drag] = useDrag({
    type: 'participant',
    item: { id: participant.id, participant },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <div
      ref={drag as any}
      className={`px-4 py-3 hover:bg-[#0f1322] cursor-move transition-colors border-b border-[#2a2f4a]/50 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center space-x-3">
        {/* Аватар */}
        {participant.avatar ? (
          <img
            src={participant.avatar}
            alt={participant.name}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white font-semibold">
            {participant.name.charAt(0).toUpperCase()}
          </div>
        )}
        
        {/* Информация об участнике */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {participant.name}
          </p>
          <div className="flex flex-col gap-1">
            {/* Роль участника */}
            {participant.roles && participant.roles.length > 0 && (
              <p className="text-xs text-blue-400">
                {getRoleLabel(participant.roles)}
              </p>
            )}
            {/* Тип участника */}
            <p className="text-xs text-gray-400">
              {participant.isRegisteredUser !== false ? 'Зарегистрированный' : 'Не зарегистрированный'}
            </p>
          </div>
        </div>

        {/* Иконки статуса медиа */}
        <div className="flex items-center space-x-2">
          {/* Иконка микрофона */}
          <svg 
            className={`w-4 h-4 ${
              participant.mediaState === 'AUDIO' || participant.mediaState === 'AUDIO_VIDEO'
                ? 'text-green-500' 
                : 'text-gray-500'
            }`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          {/* Иконка камеры */}
          <svg 
            className={`w-4 h-4 ${
              participant.mediaState === 'VIDEO' || participant.mediaState === 'AUDIO_VIDEO'
                ? 'text-green-500' 
                : 'text-gray-500'
            }`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {/* Иконка демонстрации */}
          {participant.demonstrationType && (
            <div title={`Демонстрация: ${participant.demonstrationType}`}>
              <svg 
                className="w-4 h-4 text-blue-500" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          <button className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
