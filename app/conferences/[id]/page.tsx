'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { conferencesAPI, layoutAPI, Conference, Participant, LayoutCell, Layout, authAPI, CellType } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import { getCurrentBusId, onConferenceEvent } from '@/lib/websocket';
import ParticipantList from '@/components/ParticipantList';
import LayoutGrid from '@/components/LayoutGrid';

export default function ConferencePage() {
  const router = useRouter();
  const params = useParams();
  const conferenceId = params.id as string;

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

  useEffect(() => {
    // Проверяем авторизацию синхронно
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    const loadData = async () => {
      try {
        // Сначала ждем получения busId от WebSocket соединения
        // Проверяем busId каждые 100мс, максимум 5 секунд
        let busId: string | null = null;
        let attempts = 0;
        const maxAttempts = 50; // 50 * 100ms = 5 секунд
        
        while (!busId && attempts < maxAttempts) {
          busId = getCurrentBusId();
          if (!busId) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }
        }
        
        if (!busId) {
          console.warn('[ConferencePage] BusId not received from WebSocket, trying to join without it');
        } else {
          // Присоединяемся к конференции
          try {
            await conferencesAPI.join(conferenceId, busId);
            
            // Подписываемся на события конференции через WebSocket
            try {
              await conferencesAPI.subscribeToEvents(conferenceId);
            } catch (subscribeErr: any) {
              console.error('[ConferencePage] Error subscribing to conference events:', subscribeErr);
            }
          } catch (joinErr: any) {
            console.error('[ConferencePage] Error joining conference:', joinErr);
            setError(`Ошибка присоединения к конференции: ${joinErr.message}`);
          }
        }
        // Используем Promise.allSettled вместо Promise.all, чтобы ошибка в одном запросе
        // не блокировала остальные данные
        const results = await Promise.allSettled([
          conferencesAPI.getById(conferenceId),
          conferencesAPI.getMediaInfo(conferenceId), // Используем getMediaInfo вместо participantsAPI.getByConference
          layoutAPI.getLayout(conferenceId),
          layoutAPI.getLayouts(), // Загружаем список раскладок
        ]);
        
        // Обрабатываем результаты
        const confData = results[0].status === 'fulfilled' ? results[0].value : null;
        const mediaInfoData = results[1].status === 'fulfilled' ? results[1].value : null;
        
        console.log('[ConferencePage] Media info data:', mediaInfoData);
        console.log('[ConferencePage] Media info participants:', mediaInfoData?.participants);
        console.log('[ConferencePage] Media info participants type:', Array.isArray(mediaInfoData?.participants) ? 'array' : typeof mediaInfoData?.participants);
        console.log('[ConferencePage] Media info participants length:', mediaInfoData?.participants?.length || 0);
        
        const participantsData = mediaInfoData?.participants || []; // Извлекаем участников из медиа-информации
        const layoutDataRaw = results[2].status === 'fulfilled' ? results[2].value : null;
        const layoutsData = results[3].status === 'fulfilled' ? results[3].value : [];
        
        // Логируем ошибки
        if (results[0].status === 'rejected') {
          console.error('[ConferencePage] Error loading conference:', results[0].reason);
        }
        if (results[1].status === 'rejected') {
          console.error('[ConferencePage] Error loading media info:', results[1].reason);
        }
        if (results[2].status === 'rejected') {
          console.warn('[ConferencePage] Error loading layout (non-critical):', results[2].reason);
        }
        if (results[3].status === 'rejected') {
          console.warn('[ConferencePage] Error loading layouts list (non-critical):', results[3].reason);
        }

        // Используем данные из getLayout
        const layoutSettingsToUse = layoutDataRaw;
        
        // Извлекаем layoutId и showNames из layoutData или layoutSettings
        let layoutData: LayoutCell[] = [];
        let layoutIdFromResponse: number | null = null;
        
        if (layoutSettingsToUse) {
          if (Array.isArray(layoutSettingsToUse)) {
            // Если это массив ячеек (старый формат)
            layoutData = layoutSettingsToUse;
          } else if (typeof layoutSettingsToUse === 'object') {
            const layoutObj = layoutSettingsToUse as any;
            
            // Извлекаем layoutId
            layoutIdFromResponse = layoutObj.layoutId || null;
            
            // Извлекаем showNames
            if (layoutObj.showNames !== undefined) {
              setShowNames(layoutObj.showNames);
            }
            
            // Обрабатываем cellMapping из layoutConfiguration если есть
            if (layoutObj.layoutConfiguration?.cellMapping && Array.isArray(layoutObj.layoutConfiguration.cellMapping)) {
              const cellMapping = layoutObj.layoutConfiguration.cellMapping;
              
              // Сортируем по cellNumber (начинается с 1)
              cellMapping.sort((a: any, b: any) => a.cellNumber - b.cellNumber);
              
              // Загружаем настройки раскладки через /system/layouts/{layoutId}
              let layoutStructure: any = null;
              if (layoutIdFromResponse) {
                try {
                  layoutStructure = await layoutAPI.getLayoutById(layoutIdFromResponse);
                } catch (err) {
                  console.warn('[ConferencePage] Could not load layout settings:', err);
                }
              }
              
              // Если есть cellConfiguration в layoutStructure, используем его для создания ячеек
              if (layoutStructure?.layoutConfiguration?.cellConfiguration && Array.isArray(layoutStructure.layoutConfiguration.cellConfiguration)) {
                const cellConfiguration = layoutStructure.layoutConfiguration.cellConfiguration;
                
                // Сортируем по cellNumber
                cellConfiguration.sort((a: any, b: any) => a.cellNumber - b.cellNumber);
                
                // Создаем Map для быстрого поиска participantId по cellNumber
                const cellMappingMap = new Map(
                  cellMapping.map((cell: any) => [cell.cellNumber, cell])
                );
                
                // Преобразуем cellConfiguration в LayoutCell[]
                layoutData = cellConfiguration.map((cellConfig: any) => {
                  const mapping = cellMappingMap.get(cellConfig.cellNumber) as any;
                  
                  const participantId = mapping && mapping.participantId 
                    ? mapping.participantId 
                    : undefined;
                  
                  console.log('[ConferencePage] Processing cell:', {
                    cellNumber: cellConfig.cellNumber,
                    mapping: mapping,
                    participantId: participantId,
                    hasParticipantId: !!participantId,
                    cellType: mapping?.cellType,
                  });
                  
                  return {
                    id: `cell-${cellConfig.cellNumber}`,
                    row: 0, // Не используется при наличии left/top
                    col: 0, // Не используется при наличии left/top
                    width: 1, // Не используется при наличии widthPercent
                    height: 1, // Не используется при наличии heightPercent
                    left: cellConfig.left,
                    top: cellConfig.top,
                    widthPercent: cellConfig.width,
                    heightPercent: cellConfig.height,
                    // Устанавливаем participantId если он есть в mapping, независимо от cellType
                    participantId: participantId,
                    cellType: mapping && mapping.cellType 
                      ? (mapping.cellType === 'FIXED' ? undefined : mapping.cellType as CellType)
                      : undefined,
                    speakerIndex: mapping && (mapping.cellType === 'SPEAKER' || mapping.cellType === 'PREVIOUS_SPEAKER') && mapping.speakerIndex !== undefined
                      ? mapping.speakerIndex
                      : undefined,
                  };
                });
              } else if (layoutStructure?.cells && Array.isArray(layoutStructure.cells)) {
                // Если есть структура раскладки с ячейками (старый формат), используем её
                const cellMappingMap = new Map(
                  cellMapping.map((cell: any) => [cell.cellNumber, cell])
                );
                
                layoutData = layoutStructure.cells.map((cell: LayoutCell, index: number) => {
                  const cellNumber = index + 1; // cellNumber начинается с 1
                  const mapping = cellMappingMap.get(cellNumber) as any;
                  
                  console.log('[ConferencePage] Processing cell (old format):', {
                    cellNumber: cellNumber,
                    mapping: mapping,
                    hasParticipantId: !!mapping?.participantId,
                    cellType: mapping?.cellType,
                  });
                  
                  return {
                    ...cell,
                    // Устанавливаем participantId если он есть в mapping, независимо от cellType
                    participantId: mapping && mapping.participantId 
                      ? mapping.participantId 
                      : cell.participantId, // Сохраняем существующий participantId если mapping не содержит его
                    cellType: mapping && mapping.cellType 
                      ? (mapping.cellType === 'FIXED' ? undefined : mapping.cellType as CellType)
                      : cell.cellType,
                    speakerIndex: mapping && (mapping.cellType === 'SPEAKER' || mapping.cellType === 'PREVIOUS_SPEAKER') && mapping.speakerIndex !== undefined
                      ? mapping.speakerIndex
                      : cell.speakerIndex,
                  };
                });
              } else {
                // Если структуры нет, создаем ячейки на основе cellMapping
                // Предполагаем сетку 4x3 (можно улучшить, если есть информация о количестве колонок)
                const cols = 4;
                layoutData = cellMapping.map((cell: any) => {
                  const cellIndex = cell.cellNumber - 1; // Преобразуем в 0-based индекс
                  const row = Math.floor(cellIndex / cols);
                  const col = cellIndex % cols;
                  
                  console.log('[ConferencePage] Processing cell (no structure):', {
                    cellNumber: cell.cellNumber,
                    cell: cell,
                    hasParticipantId: !!cell.participantId,
                    cellType: cell.cellType,
                  });
                  
                  return {
                    id: `cell-${row}-${col}`,
                    row: row,
                    col: col,
                    width: 1,
                    height: 1,
                    // Устанавливаем participantId если он есть, независимо от cellType
                    participantId: cell.participantId || undefined,
                    cellType: cell.cellType !== 'FIXED' ? cell.cellType as CellType : undefined,
                    speakerIndex: (cell.cellType === 'SPEAKER' || cell.cellType === 'PREVIOUS_SPEAKER') && cell.speakerIndex !== undefined
                      ? cell.speakerIndex
                      : undefined,
                  };
                });
              }
            } else if (layoutObj.cells && Array.isArray(layoutObj.cells)) {
              // Если есть cells напрямую (старый формат)
              layoutData = layoutObj.cells;
            } else if (layoutObj.layoutId) {
              // Если есть только layoutId, но нет cells, загружаем структуру раскладки
              try {
                const layoutStructure = await layoutAPI.getLayoutById(layoutObj.layoutId);
                
                // Проверяем наличие cellConfiguration
                if (layoutStructure?.layoutConfiguration?.cellConfiguration && Array.isArray(layoutStructure.layoutConfiguration.cellConfiguration)) {
                  const cellConfiguration = layoutStructure.layoutConfiguration.cellConfiguration;
                  
                  // Сортируем по cellNumber
                  cellConfiguration.sort((a: any, b: any) => a.cellNumber - b.cellNumber);
                  
                  // Преобразуем cellConfiguration в LayoutCell[]
                  layoutData = cellConfiguration.map((cellConfig: any) => ({
                    id: `cell-${cellConfig.cellNumber}`,
                    row: 0,
                    col: 0,
                    width: 1,
                    height: 1,
                    left: cellConfig.left,
                    top: cellConfig.top,
                    widthPercent: cellConfig.width,
                    heightPercent: cellConfig.height,
                  }));
                } else if (layoutStructure?.cells && Array.isArray(layoutStructure.cells)) {
                  layoutData = layoutStructure.cells;
                }
              } catch (err) {
                console.warn('[ConferencePage] Could not load layout structure:', err);
              }
            }
          }
        }

        if (confData) {
          setConference(confData);
        } else {
          setError('Не удалось загрузить данные конференции');
        }
        
        // Убеждаемся, что participantsData - это массив перед установкой
        const participantsArray = Array.isArray(participantsData) ? participantsData : [];
        console.log('[ConferencePage] Setting participants:', participantsArray.length);
        console.log('[ConferencePage] Participant IDs:', participantsArray.map(p => p.id));
        setParticipants(participantsArray);
        
        // Устанавливаем раскладку, если она загружена, иначе используем дефолтную
        if (Array.isArray(layoutData) && layoutData.length > 0) {
          console.log('[ConferencePage] Setting layout with cells:', layoutData.length);
          const cellsWithParticipants = layoutData.filter(c => c.participantId);
          console.log('[ConferencePage] Layout cells with participants:', cellsWithParticipants.map(c => ({ id: c.id, participantId: c.participantId })));
          console.log('[ConferencePage] Participant IDs in cells:', cellsWithParticipants.map(c => c.participantId));
          
          // Проверяем, есть ли соответствие между participantId в ячейках и id участников
          const participantIdsInCells = new Set(cellsWithParticipants.map(c => c.participantId).filter((id): id is string => !!id));
          const participantIds = new Set(participantsArray.map(p => p.id));
          const matchingIds = Array.from(participantIdsInCells).filter(id => participantIds.has(id));
          const missingIds = Array.from(participantIdsInCells).filter(id => !participantIds.has(id));
          console.log('[ConferencePage] Matching participant IDs:', matchingIds);
          console.log('[ConferencePage] Missing participant IDs (in cells but not in participants):', missingIds);
          
          setLayout(layoutData);
        } else {
          console.log('[ConferencePage] Using default layout');
          setLayout(createDefaultLayout());
        }
        
        // Устанавливаем список раскладок и выбранную раскладку
        if (Array.isArray(layoutsData) && layoutsData.length > 0) {
          setLayouts(layoutsData);
          
          // Устанавливаем выбранную раскладку, если она найдена
          if (layoutIdFromResponse !== null) {
            const foundLayout = layoutsData.find((l) => l.layoutId === layoutIdFromResponse);
            if (foundLayout) {
              setSelectedLayoutId(layoutIdFromResponse);
            }
          }
        }
      } catch (err: any) {
        console.error('[ConferencePage] Error in loadData:', err);
        
        // Если ошибка 401, значит токен невалидный - редирект на логин
        if (err.message?.includes('401') || err.message?.includes('авторизации')) {
          authAPI.logout();
          router.push('/login');
          return;
        }
        setError(err.message || 'Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    };

    if (conferenceId) {
      loadData();
    }
  }, [conferenceId, router]);

  // Подписываемся на события конференции через WebSocket
  useEffect(() => {
    if (!conferenceId) {
      console.log('[ConferencePage] ⚠️ No conferenceId, skipping event subscription');
      return;
    }

    console.log('[ConferencePage] 📝 Subscribing to conference events for:', conferenceId);
    
    // Подписываемся на события конференции
    let unsubscribe: (() => void) | null = null;
    unsubscribe = onConferenceEvent((event) => {
      console.log('[ConferencePage] ✅ Conference event received:', event);
      console.log('[ConferencePage] Event class:', event._class);
      
      const eventClass = event._class || '';
      
      // Обрабатываем событие изменения медиа потока
      if (eventClass === 'MediaRoomStreamChangedEvent' || eventClass.includes('MediaRoomStreamChanged')) {
        console.log('[ConferencePage] ✅ MediaRoomStreamChangedEvent handler triggered!');
        console.log('[ConferencePage] MediaRoomStreamChangedEvent received:', event);
        
        // Событие приходит как innerEvent из NumberedMessage
        // Используем само событие (оно уже является innerEvent из websocket.ts)
        const participantId = event.participantId || (event as any).id;
        const streamType = (event as any).streamType;
        const mediaState = (event as any).mediaState;
        
        console.log('[ConferencePage] MediaRoomStreamChangedEvent details:', {
          participantId,
          streamType,
          mediaState,
          fullEvent: event,
        });
        
        if (!participantId) {
          console.warn('[ConferencePage] ⚠️ MediaRoomStreamChangedEvent missing participantId:', event);
          return;
        }
        
        setParticipants((prevParticipants) => {
          const participantExists = prevParticipants.some(p => p.id === participantId);
          console.log('[ConferencePage] Participant exists:', participantExists, 'Total participants:', prevParticipants.length);
          
          if (!participantExists) {
            console.warn('[ConferencePage] ⚠️ Participant not found for MediaRoomStreamChangedEvent:', participantId);
            return prevParticipants;
          }
          
          const updated = prevParticipants.map((p) => {
            if (p.id === participantId) {
              // Если streamType === "SPEAKER", обновляем mediaState
              if (streamType === 'SPEAKER') {
                const updatedParticipant = {
                  ...p,
                  mediaState: mediaState !== undefined && mediaState !== null 
                    ? mediaState as 'AUDIO' | 'VIDEO' | 'AUDIO_VIDEO' | 'NONE'
                    : p.mediaState,
                  // Очищаем demonstrationType, если переключились на SPEAKER
                  demonstrationType: undefined,
                };
                
                console.log('[ConferencePage] Updating participant mediaState (SPEAKER):', {
                  participantId: p.id,
                  oldMediaState: p.mediaState,
                  newMediaState: updatedParticipant.mediaState,
                  streamType,
                });
                
                return updatedParticipant;
              } else {
                // Проверяем, является ли streamType связанным с демонстрацией
                const isDemonstration = streamType === 'SCREEN_SHARE' || streamType === 'SCREEN' || streamType?.includes('SHARE');
                
                if (isDemonstration) {
                  // Если это событие демонстрации и mediaState !== 'NONE', устанавливаем demonstrationType
                  // Если mediaState === 'NONE', это означает остановку демонстрации - очищаем demonstrationType
                  const newDemonstrationType = mediaState !== undefined && mediaState !== null && mediaState !== 'NONE' 
                    ? streamType 
                    : undefined;
                  
                  console.log('[ConferencePage] Updating participant demonstration:', {
                    participantId: p.id,
                    oldDemonstrationType: p.demonstrationType,
                    newDemonstrationType,
                    streamType,
                    mediaState,
                    isStopping: mediaState === 'NONE',
                  });
                  
                  return { 
                    ...p, 
                    demonstrationType: newDemonstrationType,
                  };
                } else {
                  // Если streamType не связан с демонстрацией и не является SPEAKER,
                  // возможно это событие об остановке - очищаем demonstrationType
                  console.log('[ConferencePage] Unknown streamType, clearing demonstrationType:', {
                    participantId: p.id,
                    streamType,
                    oldDemonstrationType: p.demonstrationType,
                  });
                  
                  return { 
                    ...p, 
                    demonstrationType: undefined,
                  };
                }
              }
            }
            return p;
          });
          
          console.log('[ConferencePage] ✅ Participant updated for MediaRoomStreamChangedEvent:', participantId, 'streamType:', streamType);
          return updated;
        });
      }
      
      // Обрабатываем событие присоединения участника к конференции
      if (eventClass === 'ConferenceSessionParticipantJoinEvent') {
        console.log('[ConferencePage] ✅ ConferenceSessionParticipantJoinEvent handler triggered!');
        console.log('[ConferencePage] Full event:', JSON.stringify(event, null, 2));
        console.log('[ConferencePage] Event keys:', Object.keys(event));
        
        // Получаем данные участника из поля participant события
        const participantData = (event as any).participant;
        
        console.log('[ConferencePage] Participant data:', participantData);
        console.log('[ConferencePage] Participant data keys:', participantData ? Object.keys(participantData) : 'null');
        
        if (!participantData) {
          console.warn('[ConferencePage] ⚠️ ConferenceSessionParticipantJoinEvent received but participant data not found');
          console.warn('[ConferencePage] Event structure:', event);
          return;
        }
        
        const participantId = participantData.participantId;
        
        console.log('[ConferencePage] Extracted participantId:', participantId);
        
        if (!participantId) {
          console.warn('[ConferencePage] ⚠️ ConferenceSessionParticipantJoinEvent received but participantId not found');
          console.warn('[ConferencePage] Participant data:', participantData);
          return;
        }
        
        // Проверяем, нет ли уже такого участника в списке
        setParticipants((prevParticipants) => {
          console.log('[ConferencePage] Current participants count:', prevParticipants.length);
          console.log('[ConferencePage] Current participant IDs:', prevParticipants.map(p => p.id));
          
          const exists = prevParticipants.some(p => p.id === participantId);
          if (exists) {
            console.log('[ConferencePage] ⚠️ Participant already exists:', participantId);
            return prevParticipants;
          }
          
          // Формируем URL аватара если есть
          let avatarUrl: string | undefined = undefined;
          const avatarResourceId = participantData.avatarResourceId;
          console.log('[ConferencePage] Avatar resource ID:', avatarResourceId);
          
          if (avatarResourceId) {
            avatarUrl = `/api/resources/${avatarResourceId}`;
            const sessionId = typeof window !== 'undefined' ? localStorage.getItem('session_id') : null;
            if (sessionId) {
              avatarUrl += `?session=${encodeURIComponent(sessionId)}`;
            }
          }
          
          // Получаем состояние медиа из webMediaInfo.speakerStreamInfo.state
          const mediaState = participantData.webMediaInfo?.speakerStreamInfo?.state || participantData.mediaState || 'NONE';
          console.log('[ConferencePage] Media state:', mediaState);
          
          // Проверяем состояние демонстрации из screenShareStreamInfo.state
          const screenShareState = participantData.webMediaInfo?.screenShareStreamInfo?.state;
          const demonstrationType = screenShareState && screenShareState !== 'NONE' ? 'SCREEN_SHARE' : undefined;
          console.log('[ConferencePage] Screen share state for new participant:', screenShareState, 'demonstrationType:', demonstrationType);
          
          // Создаем объект участника в формате Participant
          const newParticipant: Participant = {
            id: participantId,
            userId: participantData.profileId || participantId,
            name: participantData.name || 'Без имени',
            avatar: avatarUrl,
            roles: participantData.roles || [],
            isRegisteredUser: participantData.isRegisteredUser !== undefined 
              ? participantData.isRegisteredUser 
              : true,
            mediaState: mediaState,
            demonstrationType: demonstrationType,
          };
          
          console.log('[ConferencePage] ✅ Adding new participant:', newParticipant);
          console.log('[ConferencePage] New participants count:', prevParticipants.length + 1);
          
          return [...prevParticipants, newParticipant];
        });
        
        // После добавления участника проверяем и обновляем раскладку
        // Загружаем актуальную раскладку конференции, чтобы увидеть, есть ли новый участник в ячейках
        (async () => {
          try {
            const layoutDataRaw = await layoutAPI.getLayout(conferenceId);
            
            if (layoutDataRaw && typeof layoutDataRaw === 'object') {
              const layoutObj = layoutDataRaw as any;
              
              // Обрабатываем cellMapping из layoutConfiguration если есть
              if (layoutObj.layoutConfiguration?.cellMapping && Array.isArray(layoutObj.layoutConfiguration.cellMapping)) {
                const cellMapping = layoutObj.layoutConfiguration.cellMapping;
                
                // Загружаем настройки раскладки через /system/layouts/{layoutId}
                let layoutStructure: any = null;
                if (layoutObj.layoutId) {
                  try {
                    layoutStructure = await layoutAPI.getLayoutById(layoutObj.layoutId);
                  } catch (err) {
                    console.warn('[ConferencePage] Could not load layout settings after participant join:', err);
                  }
                }
                
                // Если есть cellConfiguration в layoutStructure, используем его для создания ячеек
                if (layoutStructure?.layoutConfiguration?.cellConfiguration && Array.isArray(layoutStructure.layoutConfiguration.cellConfiguration)) {
                  const cellConfiguration = layoutStructure.layoutConfiguration.cellConfiguration;
                  cellConfiguration.sort((a: any, b: any) => a.cellNumber - b.cellNumber);
                  
                  const cellMappingMap = new Map(
                    cellMapping.map((cell: any) => [cell.cellNumber, cell])
                  );
                  
                  const updatedLayoutData = cellConfiguration.map((cellConfig: any) => {
                    const mapping = cellMappingMap.get(cellConfig.cellNumber) as any;
                    const cellParticipantId = mapping && mapping.participantId ? mapping.participantId : undefined;
                    
                    return {
                      id: `cell-${cellConfig.cellNumber}`,
                      row: 0,
                      col: 0,
                      width: 1,
                      height: 1,
                      left: cellConfig.left,
                      top: cellConfig.top,
                      widthPercent: cellConfig.width,
                      heightPercent: cellConfig.height,
                      participantId: cellParticipantId,
                      cellType: mapping && mapping.cellType 
                        ? (mapping.cellType === 'FIXED' ? undefined : mapping.cellType as CellType)
                        : undefined,
                      speakerIndex: mapping && (mapping.cellType === 'SPEAKER' || mapping.cellType === 'PREVIOUS_SPEAKER') && mapping.speakerIndex !== undefined
                        ? mapping.speakerIndex
                        : undefined,
                    };
                  });
                  
                  // Проверяем, есть ли новый участник в обновленной раскладке
                  const participantInLayout = updatedLayoutData.some((cell: LayoutCell) => cell.participantId === participantId);
                  if (participantInLayout) {
                    console.log('[ConferencePage] ✅ Participant found in updated layout, updating layout');
                    setLayout(updatedLayoutData);
                  } else {
                    console.log('[ConferencePage] Participant not in layout cells');
                  }
                }
              }
            }
          } catch (err) {
            console.warn('[ConferencePage] Could not reload layout after participant join:', err);
          }
        })();
      }
      
      // Обрабатываем событие выхода участника из конференции
      if (eventClass === 'ConferenceSessionParticipantLeaveEvent') {
        console.log('[ConferencePage] ConferenceSessionParticipantLeaveEvent received:', event);
        
        // Получаем participantId из события
        const participantId = event.participantId || event.id || (event as any).participant?.id;
        
        if (participantId) {
          // Удаляем участника из списка
          setParticipants((prevParticipants) =>
            prevParticipants.filter((p) => p.id !== participantId)
          );
          
          // Удаляем участника из раскладки
          setLayout((prevLayout) =>
            prevLayout.map((cell) => {
              if (cell.participantId === participantId) {
                const { participantId: _, ...rest } = cell;
                return rest as LayoutCell;
              }
              return cell;
            })
          );
          
          console.log('[ConferencePage] ✅ Participant removed:', participantId);
        } else {
          console.warn('[ConferencePage] ⚠️ ConferenceSessionParticipantLeaveEvent received but participantId not found:', event);
        }
      }
    });

    // Отписываемся при размонтировании компонента
    return () => {
      unsubscribe();
    };
  }, [conferenceId]);

  const createDefaultLayout = (): LayoutCell[] => {
    // Создаем сетку 4x3 по умолчанию
    const cells: LayoutCell[] = [];
    const rows = 3;
    const cols = 4;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        cells.push({
          id: `cell-${row}-${col}`,
          row,
          col,
          width: 1,
          height: 1,
        });
      }
    }

    return cells;
  };

  const handleDrop = (participantId: string, cellId: string, originalCellId?: string) => {
    const targetCell = layout.find((c) => c.id === cellId);
    if (!targetCell) return;

    // Проверяем, занята ли целевая ячейка другим участником
    const targetCellParticipantId = targetCell.participantId;
    const isTargetCellOccupied = targetCellParticipantId && targetCellParticipantId !== participantId;

    // Находим исходную ячейку (откуда перетаскивается участник)
    // Если originalCellId не передан, ищем ячейку с этим участником
    const sourceCellId = originalCellId || layout.find((c) => c.participantId === participantId)?.id;

    // Обновляем только локальное состояние, без вызова API
    setLayout((prevLayout) =>
      prevLayout.map((c) => {
        // Если это целевая ячейка - помещаем перетаскиваемого участника
        if (c.id === cellId) {
          return { ...c, participantId };
        }
        
        // Если целевая ячейка была занята другим участником, выполняем обмен
        if (isTargetCellOccupied && targetCellParticipantId) {
          // Если есть исходная ячейка (участник перетаскивается из другой ячейки)
          if (sourceCellId && c.id === sourceCellId) {
            // Перемещаем участника из целевой ячейки в исходную
            return { ...c, participantId: targetCellParticipantId };
          }
          // Если исходной ячейки нет (участник перетаскивается из списка),
          // участник из целевой ячейки просто освобождает её (уже обработано выше)
        }
        
        // Убираем участника из других ячеек (если не происходит обмен)
        if (c.participantId === participantId && c.id !== cellId) {
          // Если происходит обмен, не удаляем участника из исходной ячейки здесь
          // (это уже обработано выше)
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

    // Отмечаем наличие несохраненных изменений
    setHasUnsavedChanges(true);
  };

  // Вспомогательная функция для обработки настроек раскладки и создания ячеек
  const processLayoutSettings = async (layoutId: number): Promise<LayoutCell[]> => {
    try {
      // Загружаем настройки раскладки через /system/layouts/{layoutId}
      const layoutStructure = await layoutAPI.getLayoutById(layoutId);
      
      // Проверяем наличие cellConfiguration
      if (layoutStructure?.layoutConfiguration?.cellConfiguration && Array.isArray(layoutStructure.layoutConfiguration.cellConfiguration)) {
        const cellConfiguration = layoutStructure.layoutConfiguration.cellConfiguration;
        
        // Сортируем по cellNumber
        cellConfiguration.sort((a: any, b: any) => a.cellNumber - b.cellNumber);
        
        // Преобразуем cellConfiguration в LayoutCell[]
        return cellConfiguration.map((cellConfig: any) => ({
          id: `cell-${cellConfig.cellNumber}`,
          row: 0,
          col: 0,
          width: 1,
          height: 1,
          left: cellConfig.left,
          top: cellConfig.top,
          widthPercent: cellConfig.width,
          heightPercent: cellConfig.height,
        }));
      } else if (layoutStructure?.cells && Array.isArray(layoutStructure.cells)) {
        // Если есть структура раскладки с ячейками (старый формат), используем её
        return layoutStructure.cells;
      }
      
      return [];
    } catch (err) {
      console.warn('[ConferencePage] Could not load layout settings:', err);
      return [];
    }
  };

  const handleApply = async () => {
    if (!selectedLayoutId) {
      setError('Выберите раскладку для применения');
      return;
    }

    setApplying(true);
    setError('');

    try {
      // Сохраняем текущих участников и типы ячеек перед обновлением структуры
      const currentCellData = new Map<number, { participantId?: string; cellType?: CellType; speakerIndex?: number }>();
      layout.forEach((cell, index) => {
        currentCellData.set(index, {
          participantId: cell.participantId,
          cellType: cell.cellType,
          speakerIndex: cell.speakerIndex,
        });
      });

      // Загружаем настройки раскладки и обновляем сетку
      const newLayoutCells = await processLayoutSettings(selectedLayoutId);
      
      let finalLayout: LayoutCell[];
      if (newLayoutCells.length > 0) {
        // Сохраняем участников и типы ячеек в новых ячейках по индексу (если структура не изменилась)
        finalLayout = newLayoutCells.map((cell, index) => {
          const cellData = currentCellData.get(index);
          return {
            ...cell,
            participantId: cellData?.participantId,
            cellType: cellData?.cellType,
            speakerIndex: cellData?.speakerIndex,
          };
        });
        setLayout(finalLayout);
      } else {
        finalLayout = layout;
      }

      // Формируем cellMapping из финального layout с использованием актуальных cellType и speakerIndex
      // cellNumber начинается с 1 для API (не с 0)
      // Исключаем ячейки с типом AUTO из массива
      // Используем актуальное состояние layout для получения последних изменений speakerIndex
      const cellMapping = finalLayout
        .map((cell, index) => {
          // Получаем актуальную ячейку из состояния layout по id
          const currentCell = layout.find(c => c.id === cell.id) || cell;
          
          if (currentCell.participantId) {
            // Ячейка с участником - тип FIXED
            return {
              cellNumber: index + 1,
              cellType: 'FIXED' as const,
              participantId: currentCell.participantId,
            };
        } else {
          // Пустая ячейка - используем выбранный cellType из актуального состояния или EMPTY по умолчанию
          const cellType = (currentCell.cellType || 'EMPTY') as CellType;
          // Пропускаем ячейки с типом AUTO
          if (cellType === 'AUTO') {
            return null;
          }
          // Для типа SPEAKER добавляем speakerIndex
          if (cellType === 'SPEAKER') {
            return {
              cellNumber: index + 1,
              cellType: cellType,
              speakerIndex: currentCell.speakerIndex ?? 0,
            };
          }
          // Для типа PREVIOUS_SPEAKER не добавляем speakerIndex
          if (cellType === 'PREVIOUS_SPEAKER') {
            return {
              cellNumber: index + 1,
              cellType: cellType,
            };
          }
          return {
            cellNumber: index + 1,
            cellType: cellType,
          };
        }
      })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // Применяем раскладку и изменения к конференции через PATCH /conference-sessions/{conferenceSessionId}
      await conferencesAPI.update(conferenceId, {
        layout: {
          value: {
            layoutId: selectedLayoutId,
            showNames: showNames,
            layoutConfiguration: {
              cellMapping: cellMapping,
              periodicity: 30,
            },
          },
        },
      });

      // Сбрасываем флаг несохраненных изменений
      setHasUnsavedChanges(false);
    } catch (err: any) {
      console.error('[ConferencePage] Error applying layout and changes:', err);
      setError(err.message || 'Ошибка применения раскладки и изменений');
    } finally {
      setApplying(false);
    }
  };

  const handleRemove = (cellId: string) => {
    const cell = layout.find((c) => c.id === cellId);
    if (!cell || !cell.participantId) return;

    // Обновляем только локальное состояние, без вызовов API
    setLayout((prevLayout) =>
      prevLayout.map((c) => {
        if (c.id === cellId) {
          const { participantId: _, ...rest } = c;
          return rest as LayoutCell;
        }
        return c;
      })
    );

    // Обновляем участника в списке
    setParticipants((prevParticipants) =>
      prevParticipants.map((p) =>
        p.id === cell.participantId
          ? {
              ...p,
              position: undefined,
            }
          : p
      )
    );

    // Отмечаем наличие несохраненных изменений
    setHasUnsavedChanges(true);
  };

  const handleCellTypeChange = (cellId: string, cellType: CellType) => {
    setLayout((prevLayout) =>
      prevLayout.map((c) => {
        if (c.id === cellId) {
          // При смене типа на SPEAKER устанавливаем speakerIndex по умолчанию 0
          // Для PREVIOUS_SPEAKER speakerIndex не используется
          const speakerIndex = cellType === 'SPEAKER' 
            ? (c.speakerIndex ?? 0)
            : cellType === 'PREVIOUS_SPEAKER'
            ? undefined
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
      prevLayout.map((c) => {
        if (c.id === cellId) {
          return { ...c, speakerIndex };
        }
        return c;
      })
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
        <header className="bg-[#1a1f3a] text-white px-6 py-3 flex items-center justify-between border-b border-[#2a2f4a]">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/conferences')}
              className="text-gray-300 hover:text-white transition-colors"
            >
              ←
            </button>
            <span className="text-sm font-medium">
              {conference?.name || 'Конференция'}
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/conferences" className="text-gray-300 hover:text-white text-sm">
              Конференции
            </Link>
            <Link href="/layouts" className="text-gray-300 hover:text-white text-sm">
              Раскладки
            </Link>
          </div>
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

