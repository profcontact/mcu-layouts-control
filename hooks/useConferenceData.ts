// Кастомный хук для загрузки данных конференции

import { useState, useEffect, useRef } from 'react';
import { Conference, Participant, LayoutCell } from '@/lib/api';
import { logger } from '@/lib/logger';

export interface UseConferenceDataOptions {
  conferenceId: string;
  loadConference: () => Promise<Conference>;
  loadParticipants: () => Promise<Participant[]>;
  loadLayout: () => Promise<LayoutCell[]>;
  onJoin?: () => Promise<void>;
  skip?: boolean;
}

export interface UseConferenceDataResult {
  conference: Conference | null;
  participants: Participant[];
  layout: LayoutCell[];
  loading: boolean;
  error: string;
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
  setLayout: React.Dispatch<React.SetStateAction<LayoutCell[]>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
}

/**
 * Хук для загрузки данных конференции с защитой от двойных вызовов
 */
export function useConferenceData({
  conferenceId,
  loadConference,
  loadParticipants,
  loadLayout,
  onJoin,
  skip = false,
}: UseConferenceDataOptions): UseConferenceDataResult {
  const [conference, setConference] = useState<Conference | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [layout, setLayout] = useState<LayoutCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const loadedRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Пропускаем если skip = true
    if (skip) {
      return;
    }

    // Защита от повторных вызовов
    if (loadedRef.current === conferenceId) {
      logger.debug('[useConferenceData]', 'Data already loaded, skipping');
      return;
    }

    // Отменяем предыдущий запрос
    if (abortControllerRef.current) {
      logger.abort('[useConferenceData]', 'Aborting previous request');
      abortControllerRef.current.abort();
    }

    // Создаем новый AbortController
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    logger.loading('[useConferenceData]', `Loading data for conference ${conferenceId}`);

    const loadData = async () => {
      try {
        // Проверяем, не был ли запрос отменен
        if (signal.aborted) {
          logger.abort('[useConferenceData]', 'Request aborted before starting');
          return;
        }

        // Присоединяемся к конференции (если нужно)
        if (onJoin) {
          await onJoin();
          if (signal.aborted) return;
        }

        // Загружаем данные параллельно
        const [confData, participantsData, layoutData] = await Promise.all([
          loadConference(),
          loadParticipants(),
          loadLayout(),
        ]);

        if (signal.aborted) {
          logger.abort('[useConferenceData]', 'Request aborted after loading');
          return;
        }

        // Обновляем состояние только если компонент все еще смонтирован
        if (mountedRef.current) {
          setConference(confData);
          setParticipants(participantsData);
          setLayout(layoutData);
          loadedRef.current = conferenceId;
          logger.success('[useConferenceData]', 'Data loaded successfully');
        }
      } catch (err: any) {
        if (signal.aborted) {
          logger.abort('[useConferenceData]', 'Request aborted during error');
          return;
        }

        if (mountedRef.current) {
          const errorMessage = err.message || 'Ошибка загрузки данных';
          setError(errorMessage);
          logger.error('[useConferenceData]', errorMessage);
        }
      } finally {
        if (mountedRef.current && !signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadData();

    // Cleanup
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [conferenceId, skip]);

  return {
    conference,
    participants,
    layout,
    loading,
    error,
    setParticipants,
    setLayout,
    setError,
  };
}

