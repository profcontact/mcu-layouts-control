'use client';

import { useState, useEffect, useRef } from 'react';
import ConferenceMixedStream from './ConferenceMixedStream';

interface CompactVideoStreamProps {
  conferenceId: string;
  mediaInfo?: any; // MediaInfo с ownParticipantData
  videoComponent?: React.ReactNode; // Опциональный готовый компонент видео
}

export default function CompactVideoStream({ conferenceId, mediaInfo, videoComponent: providedVideoComponent }: CompactVideoStreamProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleFullscreen = () => {
    setIsFullscreen(true);
  };

  const handleCloseFullscreen = () => {
    setIsFullscreen(false);
  };

  // Закрытие по ESC
  useEffect(() => {
    if (!isFullscreen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseFullscreen();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFullscreen]);

  // Используем переданный компонент или создаем новый
  // Один экземпляр ConferenceMixedStream - всегда рендерится с одним ключом
  // React сохранит состояние компонента благодаря стабильному ключу
  const videoComponent = providedVideoComponent || (
    <ConferenceMixedStream 
      key={`video-stream-${conferenceId}`}
      conferenceId={conferenceId}
      mediaInfo={mediaInfo}
      className={isFullscreen ? "w-full h-full" : "w-full h-full rounded-lg"}
    />
  );

  return (
    <>
      {/* Компактное окно - показываем только если не в полноэкранном режиме */}
      {!isFullscreen && (
        <div className="relative bg-[#0f1322] border-b border-[#2a2f4a]">
          <div className="p-3">
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden group shadow-lg">
              {videoComponent}
              {/* Кнопка развернуть */}
              <button
                onClick={handleFullscreen}
                className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm z-10"
                title="Развернуть на весь экран"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
              {/* Заголовок */}
              <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                Трансляция
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно для полноэкранного просмотра */}
      {isFullscreen && (
        <div 
          className="fixed inset-0 z-50 bg-black flex items-center justify-center animate-fadeIn"
          onClick={handleCloseFullscreen}
        >
          <div 
            className="relative w-full h-full flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Кнопка закрыть */}
            <button
              onClick={handleCloseFullscreen}
              className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white p-3 rounded-lg transition-all z-10 backdrop-blur-sm"
              title="Закрыть (ESC)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Подсказка */}
            <div className="absolute top-4 left-4 bg-black/60 text-white text-sm px-3 py-2 rounded-lg backdrop-blur-sm z-10">
              Нажмите ESC или кликните вне видео для закрытия
            </div>
            
            {/* Видео на весь экран - используем тот же компонент с тем же ключом */}
            <div className="w-full h-full">
              {videoComponent}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

