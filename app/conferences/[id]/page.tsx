'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { conferencesAPI, layoutAPI, Conference, Participant, LayoutCell, Layout, CellType } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import { getCurrentBusId } from '@/lib/websocket';
import { waitFor } from '@/lib/retry';
import { processLayoutData, createDefaultLayout, createCellMappingForAPI } from '@/lib/layout-utils';
import { useConferenceEvents } from '@/hooks/useConferenceEvents';
import { logger } from '@/lib/logger';
import ParticipantList from '@/components/ParticipantList';
import LayoutGrid from '@/components/LayoutGrid';
import CompactVideoStream from '@/components/CompactVideoStream';
import ConferenceMixedStream from '@/components/ConferenceMixedStream';

export default function ConferencePage() {
  const router = useRouter();
  const params = useParams();
  const conferenceId = params.id as string;
  const hasJoinedRef = useRef(false);

  const [conference, setConference] = useState<Conference | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [layout, setLayout] = useState<LayoutCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState<number | null>(null);
  const [showNames, setShowNames] = useState<boolean>(true);
  const [applying, setApplying] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [mediaInfo, setMediaInfo] = useState<any>(null);
  const layoutStructuresCacheRef = useRef<Map<number, any>>(new Map());

  // Обработчики событий конференции
  const handleParticipantJoin = useCallback((newParticipant: Participant) => {
    setParticipants((prev) => {
      const exists = prev.some((p) => p.id === newParticipant.id);
      if (exists) return prev;
      return [...prev, newParticipant];
    });

    // Перезагружаем раскладку для проверки, добавлен ли участник
    layoutAPI.getLayout(conferenceId).then(async (layoutDataRaw) => {
      // Используем кэшированную версию getLayoutById
      const cachedGetLayoutById = async (layoutId: number) => {
        if (layoutStructuresCacheRef.current.has(layoutId)) {
          return layoutStructuresCacheRef.current.get(layoutId);
        }
        const structure = await layoutAPI.getLayoutById(layoutId);
        layoutStructuresCacheRef.current.set(layoutId, structure);
        return structure;
      };
      const { cells } = await processLayoutData(layoutDataRaw, cachedGetLayoutById);
      const participantInLayout = cells.some((cell) => cell.participantId === newParticipant.id);
      if (participantInLayout) {
        setLayout(cells);
      }
    }).catch(() => {
      // Игнорируем ошибку перезагрузки раскладки
    });
  }, [conferenceId]); // layoutStructuresCacheRef не нужно в зависимостях, так как это ref

  const handleParticipantLeave = useCallback((participantId: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== participantId));
    
    // Удаляем участника из раскладки
    setLayout((prev) =>
      prev.map((cell) => {
        if (cell.participantId === participantId) {
          const { participantId: _, ...rest } = cell;
          return rest as LayoutCell;
        }
        return cell;
      })
    );
  }, []);

  const handleMediaStateChange = useCallback((participantId: string, mediaState: string, streamType: string) => {
    setParticipants((prev) => {
      const participantExists = prev.some((p) => p.id === participantId);
      if (!participantExists) return prev;

      return prev.map((p) => {
        if (p.id === participantId) {
          // Если streamType === "SPEAKER", обновляем mediaState
          if (streamType === 'SPEAKER') {
            return {
              ...p,
              mediaState: mediaState as 'AUDIO' | 'VIDEO' | 'AUDIO_VIDEO' | 'NONE',
              demonstrationType: undefined,
            };
          }

          // Проверяем, является ли streamType связанным с демонстрацией
          const isDemonstration = streamType === 'SCREEN_SHARE' || streamType === 'SCREEN' || streamType?.includes('SHARE');
          if (isDemonstration) {
            const newDemonstrationType = mediaState !== 'NONE' ? streamType : undefined;
            return { ...p, demonstrationType: newDemonstrationType };
          }

          return { ...p, demonstrationType: undefined };
        }
        return p;
      });
    });
  }, []);

  // Подписываемся на события конференции
  useConferenceEvents(conferenceId, {
    onParticipantJoin: handleParticipantJoin,
    onParticipantLeave: handleParticipantLeave,
    onMediaStateChange: handleMediaStateChange,
  });

  // Загружаем данные конференции
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    let mounted = true;

    const loadData = async () => {
      try {
        // Ждем получения busId от WebSocket
        let busId: string | null = null;
        try {
          await waitFor(() => (busId = getCurrentBusId()) !== null, {
            timeout: 5000,
            timeoutError: 'BusId not received from WebSocket after 5 seconds',
          });
        } catch (err: any) {
          if (mounted) {
            setError('Не удалось подключиться к WebSocket. Проверьте настройки сервера.');
            setLoading(false);
          }
          return;
        }

        // Присоединяемся к конференции
        try {
          await conferencesAPI.join(conferenceId, busId!);
          hasJoinedRef.current = true; // Помечаем, что успешно присоединились
        } catch (joinErr: any) {
          if (mounted) {
            setError(`Ошибка присоединения к конференции: ${joinErr.message}`);
          }
        }

        // Загружаем данные параллельно
        const [confData, mediaInfoData, layoutDataRaw, layoutsData] = await Promise.all([
          conferencesAPI.getById(conferenceId),
          conferencesAPI.getMediaInfo(conferenceId),
          layoutAPI.getLayout(conferenceId),
          layoutAPI.getLayouts(),
        ]);

        const participantsData = mediaInfoData?.participants || [];

        // Создаем кэшированную версию getLayoutById для избежания повторных запросов
        const cachedGetLayoutById = async (layoutId: number) => {
          if (layoutStructuresCacheRef.current.has(layoutId)) {
            logger.debug('[ConferencePage]', `Using cached layout structure for layoutId: ${layoutId}`);
            return layoutStructuresCacheRef.current.get(layoutId);
          }
          logger.debug('[ConferencePage]', `Loading layout structure for layoutId: ${layoutId}`);
          const structure = await layoutAPI.getLayoutById(layoutId);
          layoutStructuresCacheRef.current.set(layoutId, structure);
          return structure;
        };

        // Обрабатываем раскладку
        const { cells: layoutData, layoutId, showNames: showNamesFromServer } = await processLayoutData(
          layoutDataRaw,
          cachedGetLayoutById
        );

        if (mounted) {
          setConference(confData);
          setParticipants(participantsData);
          setLayout(layoutData.length > 0 ? layoutData : createDefaultLayout());
          setLayouts(layoutsData);
          setShowNames(showNamesFromServer);
          setMediaInfo(mediaInfoData); // Сохраняем mediaInfo для передачи в компоненты

          if (layoutId !== null) {
            setSelectedLayoutId(layoutId);
          }
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Ошибка загрузки данных');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    // Cleanup - выходим из конференции при размонтировании
    return () => {
      mounted = false;
      if (hasJoinedRef.current) {
        conferencesAPI.leave(conferenceId);
      }
    };
  }, [conferenceId, router]);

  // Обновляем сетку при смене раскладки (только если это не начальная загрузка)
  const initialLoadRef = useRef(true);
  const layoutRef = useRef<LayoutCell[]>([]);
  
  // Обновляем ref при изменении layout
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    // Пропускаем первую загрузку, так как она уже обрабатывается в основном useEffect
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }

    if (!selectedLayoutId || loading) return;

    const loadLayoutStructure = async () => {
      try {
        // Используем кэш, если структура уже загружена
        let layoutStructure: any;
        if (layoutStructuresCacheRef.current.has(selectedLayoutId)) {
          logger.debug('[ConferencePage]', `Using cached layout structure for layoutId: ${selectedLayoutId}`);
          layoutStructure = layoutStructuresCacheRef.current.get(selectedLayoutId);
        } else {
          logger.debug('[ConferencePage]', `Loading layout structure for layoutId: ${selectedLayoutId}`);
          layoutStructure = await layoutAPI.getLayoutById(selectedLayoutId);
          layoutStructuresCacheRef.current.set(selectedLayoutId, layoutStructure);
        }
        
        let newLayoutData: LayoutCell[] = [];
        
        // Если есть cellConfiguration, используем его
        if (layoutStructure?.layoutConfiguration?.cellConfiguration) {
          const { cellConfigurationToLayoutCells } = await import('@/lib/layout-utils');
          newLayoutData = cellConfigurationToLayoutCells(
            layoutStructure.layoutConfiguration.cellConfiguration
          );
        }
        // Если есть cells (старый формат)
        else if (layoutStructure?.cells && Array.isArray(layoutStructure.cells)) {
          newLayoutData = layoutStructure.cells;
        }
        // Если структуры нет, создаем дефолтную
        else {
          newLayoutData = createDefaultLayout();
        }

        // Сохраняем текущих участников из текущей раскладки
        const currentCells = layoutRef.current;
        if (currentCells.length > 0 && newLayoutData.length === currentCells.length) {
          // Применяем участников к новой структуре
          newLayoutData = newLayoutData.map((cell, index) => {
            const currentCell = currentCells[index];
            return {
              ...cell,
              participantId: currentCell.participantId,
              cellType: currentCell.cellType,
              speakerIndex: currentCell.speakerIndex,
            };
          });
        } else if (newLayoutData.length !== currentCells.length) {
          // Если количество ячеек не совпадает, помечаем как несохраненные изменения
          setHasUnsavedChanges(true);
        }

        setLayout(newLayoutData.length > 0 ? newLayoutData : createDefaultLayout());
      } catch (err: any) {
        console.error('Error loading layout structure:', err);
        // В случае ошибки создаем дефолтную раскладку
        setLayout(createDefaultLayout());
      }
    };

    loadLayoutStructure();
  }, [selectedLayoutId, loading]);

  const handleDrop = (participantId: string, cellId: string, originalCellId?: string) => {
    const targetCell = layout.find((c) => c.id === cellId);
    if (!targetCell) return;

    // Проверяем, занята ли целевая ячейка другим участником
    const targetCellParticipantId = targetCell.participantId;
    const isTargetCellOccupied = targetCellParticipantId && targetCellParticipantId !== participantId;

    // Находим исходную ячейку
    const sourceCellId = originalCellId || layout.find((c) => c.participantId === participantId)?.id;

    setLayout((prevLayout) =>
      prevLayout.map((c) => {
        // Целевая ячейка - помещаем перетаскиваемого участника
        if (c.id === cellId) {
          return { ...c, participantId };
        }
        
        // Если целевая ячейка была занята, выполняем обмен
        if (isTargetCellOccupied && targetCellParticipantId && sourceCellId && c.id === sourceCellId) {
            return { ...c, participantId: targetCellParticipantId };
        }
        
        // Убираем участника из других ячеек
        if (c.participantId === participantId && c.id !== cellId) {
          if (!isTargetCellOccupied || c.id !== sourceCellId) {
            const { participantId: _, ...rest } = c;
            return rest as LayoutCell;
          }
        }
        
        return c;
      })
    );

    // Обновляем участника в списке
    setParticipants((prevParticipants) =>
      prevParticipants.map((p) =>
        p.id === participantId
          ? {
              ...p,
              position: {
                row: targetCell.row,
                col: targetCell.col,
                width: targetCell.width,
                height: targetCell.height,
              },
            }
          : p
      )
    );

    setHasUnsavedChanges(true);
  };

  const handleApply = async () => {
    if (!selectedLayoutId) {
      setError('Выберите раскладку для применения');
      return;
    }

    setApplying(true);
    setError('');

    try {
      // Создаем cellMapping из текущей раскладки
      const cellMapping = createCellMappingForAPI(layout);

      // Применяем раскладку к конференции
      await conferencesAPI.update(conferenceId, {
        layout: {
          value: {
            layoutId: selectedLayoutId,
            showNames,
            layoutConfiguration: {
              cellMapping,
              periodicity: 30,
            },
          },
        },
      });

      setHasUnsavedChanges(false);
    } catch (err: any) {
      setError(err.message || 'Ошибка применения раскладки');
    } finally {
      setApplying(false);
    }
  };

  const handleRemove = (cellId: string) => {
    const cell = layout.find((c) => c.id === cellId);
    if (!cell || !cell.participantId) return;

    setLayout((prevLayout) =>
      prevLayout.map((c) => {
        if (c.id === cellId) {
          const { participantId: _, ...rest } = c;
          return rest as LayoutCell;
        }
        return c;
      })
    );

    setParticipants((prevParticipants) =>
      prevParticipants.map((p) =>
        p.id === cell.participantId ? { ...p, position: undefined } : p
      )
    );

    setHasUnsavedChanges(true);
  };

  const handleCellTypeChange = (cellId: string, cellType: CellType) => {
    setLayout((prevLayout) =>
      prevLayout.map((c) => {
        if (c.id === cellId) {
          const speakerIndex = cellType === 'SPEAKER' 
            ? (c.speakerIndex ?? 0)
            : undefined;
          return { ...c, cellType, speakerIndex };
        }
        return c;
      })
    );
    setHasUnsavedChanges(true);
  };

  const handleSpeakerIndexChange = (cellId: string, speakerIndex: number) => {
    setLayout((prevLayout) =>
      prevLayout.map((c) => (c.id === cellId ? { ...c, speakerIndex } : c))
    );
    setHasUnsavedChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-300">Загрузка конференции...</p>
        </div>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen bg-black flex flex-col">
        {/* Верхняя панель */}
        <header className="bg-[#1a1f3a] text-white px-6 py-3 flex items-center border-b border-[#2a2f4a]">
          <button
            onClick={async () => {
              if (hasJoinedRef.current) {
                await conferencesAPI.leave(conferenceId);
                hasJoinedRef.current = false;
              }
              router.push('/conferences');
            }}
            className="text-gray-300 hover:text-white transition-colors mr-4"
          >
            ←
          </button>
          <span className="text-sm font-medium">
            {conference?.name || 'Конференция'}
          </span>
        </header>

        {/* Основная область */}
        <div className="flex-1 flex overflow-hidden">
          {/* Центральная область с видео */}
          <div className="flex-1 flex flex-col bg-black relative">
            {error && (
              <div className="absolute top-4 left-4 right-4 z-50 bg-red-600 text-white px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Область раскладки */}
            <div className="flex-1 relative">
                <LayoutGrid
                  cells={layout}
                  participants={participants}
                  onDrop={handleDrop}
                  onRemove={handleRemove}
                  onCellTypeChange={handleCellTypeChange}
                  onSpeakerIndexChange={handleSpeakerIndexChange}
                  gridCols={4}
                  gridRows={3}
                  showNames={showNames}
                />
            </div>
          </div>

          {/* Правая панель со списком участников */}
          <div className="w-80 bg-[#1a1f3a] border-l border-[#2a2f4a] flex flex-col">
            {/* Компактное окно трансляции */}
            <CompactVideoStream 
              conferenceId={conferenceId}
              mediaInfo={mediaInfo}
              videoComponent={mediaInfo ? (
                <ConferenceMixedStream 
                  key={`video-stream-${conferenceId}`}
                  conferenceId={conferenceId}
                  mediaInfo={mediaInfo}
                />
              ) : null}
            />
            
            <ParticipantList 
              participants={participants}
              layouts={layouts}
              selectedLayoutId={selectedLayoutId}
              setSelectedLayoutId={setSelectedLayoutId}
              showNames={showNames}
              setShowNames={setShowNames}
              hasUnsavedChanges={hasUnsavedChanges}
              applying={applying}
              handleApply={handleApply}
            />
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
