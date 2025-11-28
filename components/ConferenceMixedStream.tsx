'use client';

import { useEffect, useState } from 'react';
import { conferencesAPI } from '@/lib/api';
import { logger } from '@/lib/logger';
import VideoStream from './VideoStream';

interface ConferenceMixedStreamProps {
  conferenceId: string;
  className?: string;
  mediaInfo?: any; // Опциональный MediaInfo, если передан, не загружаем заново
}

/**
 * Компонент для отображения смешанного потока конференции (mixed stream)
 */
export default function ConferenceMixedStream({ conferenceId, className = '', mediaInfo: providedMediaInfo }: ConferenceMixedStreamProps) {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamProtocol, setStreamProtocol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadStreamUrl = async () => {
      try {
        let mediaInfo = providedMediaInfo;
        
        // Если mediaInfo не передан, загружаем его
        if (!mediaInfo) {
          logger.info('[ConferenceMixedStream]', `Loading media info for conference ${conferenceId}`);
          mediaInfo = await conferencesAPI.getMediaInfo(conferenceId);
        } else {
          logger.info('[ConferenceMixedStream]', `Using provided media info for conference ${conferenceId}`);
        }
        
        if (!mounted) return;

        // Получаем URL для подписки на смешанный поток
        // Согласно OpenAPI: speakerStreamPublishUrl используется как для публикации, 
        // так и для подписки на mixed stream конференции
        const ownParticipantData = mediaInfo.ownParticipantData;
        
        logger.debug('[ConferenceMixedStream]', 'OwnParticipantData:', {
          hasData: !!ownParticipantData,
          hasSpeakerStreamPublishUrl: !!ownParticipantData?.speakerStreamPublishUrl,
          hasScreenShareStreamPublishUrl: !!ownParticipantData?.screenShareStreamPublishUrl,
        });

        // Согласно документации: для подписки на mixed stream используем speakerStreamPublishUrl
        const subscribeUrl = ownParticipantData?.speakerStreamPublishUrl;
        const protocol = ownParticipantData?.protocol || ownParticipantData?.webMediaInfo?.speakerStreamInfo?.protocol;

        // Выводим всю структуру ownParticipantData для отладки
        logger.debug('[ConferenceMixedStream]', 'Full ownParticipantData:', ownParticipantData);

        if (!subscribeUrl) {
          logger.warn('[ConferenceMixedStream]', 'speakerStreamPublishUrl not found', {
            ownParticipantData,
          });
          setError('URL трансляции не найден. Убедитесь, что вы присоединились к конференции и медиа-сессия активна.');
          setLoading(false);
          return;
        }

        logger.success('[ConferenceMixedStream]', 'Stream URL received (FULL, NOT TRUNCATED):');
        logger.info('[ConferenceMixedStream]', subscribeUrl);
        logger.info('[ConferenceMixedStream]', 'Will use content type: PRIMARY for mixed stream subscription');
        setStreamUrl(subscribeUrl);
        setStreamProtocol(protocol || null);
        setLoading(false);
      } catch (err: any) {
        logger.error('[ConferenceMixedStream]', 'Error loading stream URL:', err);
        if (mounted) {
          setError(err.message || 'Ошибка загрузки трансляции');
          setLoading(false);
        }
      }
    };

    loadStreamUrl();

    return () => {
      mounted = false;
    };
  }, [conferenceId, providedMediaInfo]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 rounded-lg ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
          <p className="text-white text-sm">Загрузка трансляции...</p>
        </div>
      </div>
    );
  }

  if (error || !streamUrl) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 rounded-lg ${className}`}>
        <div className="text-center px-4">
          <svg className="w-12 h-12 text-gray-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-white text-sm">{error || 'Трансляция недоступна'}</p>
        </div>
      </div>
    );
  }

  return (
    <VideoStream
      streamUrl={streamUrl}
      protocol={streamProtocol || undefined}
      muted={false}
      className={className}
    />
  );
}

