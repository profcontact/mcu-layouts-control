'use client';

import { useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';

interface VideoStreamProps {
  streamUrl: string;
  protocol?: string; // Оставлено для совместимости, но не используется
  participantName?: string;
  muted?: boolean;
  className?: string;
}

/**
 * Компонент для отображения WebRTC видео-трансляции
 * Использует HTTP POST signalling (WebRTC)
 */
export default function VideoStream({
  streamUrl,
  protocol,
  participantName,
  muted = false,
  className = '',
}: VideoStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!streamUrl) {
      setError('Stream URL отсутствует');
      setIsConnecting(false);
      return;
    }

    let mounted = true;

    const setupWebRTCSignalling = async () => {
      try {
        logger.info('[VideoStream]', 'Setting up WebRTC HTTP POST signalling...');
        logger.info('[VideoStream]', `Stream URL: ${streamUrl.substring(0, 150)}...`);

        // Создаем RTCPeerConnection
        // Используем iceTransportPolicy для контроля типов кандидатов
        // "all" - все кандидаты (host, srflx, relay) - по умолчанию
        // "relay" - только relay кандидаты через TURN (исключает локальные адреса)
        // Можно настроить через переменную окружения NEXT_PUBLIC_WEBRTC_ICE_POLICY
        const icePolicy = (typeof window !== 'undefined' && 
          process.env.NEXT_PUBLIC_WEBRTC_ICE_POLICY === 'relay') 
          ? 'relay' 
          : 'all';
        
        // Настройка ICE серверов (STUN и TURN)
        const turnServer = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_SERVER : null;
        const turnUsername = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_USERNAME : null;
        const turnPassword = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_PASSWORD : null;
        
        const iceServers: RTCIceServer[] = [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ];
        
        // Добавляем TURN сервер, если настроен
        if (turnServer && turnUsername && turnPassword) {
          iceServers.push({
            urls: turnServer,
            username: turnUsername,
            credential: turnPassword,
          });
          logger.info('[VideoStream]', `TURN server configured: ${turnServer}`);
        }
        
        const pc = new RTCPeerConnection({
          iceServers,
          iceTransportPolicy: icePolicy as RTCIceTransportPolicy,
        });
        
        if (icePolicy === 'relay') {
          logger.info('[VideoStream]', 'Using iceTransportPolicy: relay (only TURN candidates)');
          if (!turnServer) {
            logger.warn('[VideoStream]', '⚠️ iceTransportPolicy is set to "relay" but no TURN server is configured!');
          }
        } else {
          logger.info('[VideoStream]', 'Using iceTransportPolicy: all (with local candidate filtering)');
        }

        pcRef.current = pc;

        // Обработчик входящих треков
        // Важно: треки могут прийти до установки remote description
        let pendingTracks: MediaStream[] = [];
        pc.ontrack = (event) => {
          logger.success('[VideoStream]', `Received track: ${event.track.kind} (${event.track.id})`);
          logger.info('[VideoStream]', `Track details:`, {
            kind: event.track.kind,
            id: event.track.id,
            enabled: event.track.enabled,
            readyState: event.track.readyState,
            muted: event.track.muted,
            streamsCount: event.streams.length,
            hasRemoteDescription: !!pc.remoteDescription,
          });
          
          if (event.streams && event.streams.length > 0) {
            const stream = event.streams[0];
            logger.info('[VideoStream]', `Track stream ID: ${stream.id}, tracks: ${stream.getTracks().map(t => `${t.kind}:${t.id}`).join(', ')}`);
            
            // Если remote description еще не установлен, сохраняем трек
            if (!pc.remoteDescription) {
              logger.info('[VideoStream]', 'Track received before remote description, saving for later');
              pendingTracks.push(stream);
            } else {
              // Применяем трек сразу
              if (videoRef.current) {
                videoRef.current.srcObject = stream;
                logger.success('[VideoStream]', 'Video stream applied to video element');
                
                // Пытаемся запустить воспроизведение сразу
                videoRef.current.play().then(() => {
                  logger.success('[VideoStream]', 'Video play() succeeded immediately after applying stream');
                }).catch((err: any) => {
                  logger.warn('[VideoStream]', 'Video play() failed immediately (may need user interaction):', err.message);
                });
              } else {
                logger.error('[VideoStream]', 'Video ref is null, cannot apply stream!');
              }
            }
          } else {
            logger.warn('[VideoStream]', 'Track received but no streams in event');
          }
        };

        // Обработчик состояния ICE соединения
        pc.oniceconnectionstatechange = () => {
          logger.info('[VideoStream]', `ICE connection state: ${pc.iceConnectionState}`);
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            if (mounted) {
              logger.success('[VideoStream]', 'ICE connection established');
              setIsConnecting(false);
            }
          } else if (pc.iceConnectionState === 'failed') {
            if (mounted) {
              logger.error('[VideoStream]', 'ICE connection failed');
              setError('Не удалось установить соединение');
              setIsConnecting(false);
            }
          } else if (pc.iceConnectionState === 'disconnected') {
            if (mounted) {
              logger.warn('[VideoStream]', 'ICE connection disconnected');
              setError('Соединение потеряно');
            }
          }
        };

        // Обработчик состояния соединения
        pc.onconnectionstatechange = () => {
          logger.info('[VideoStream]', `Connection state: ${pc.connectionState}`);
        };

        // Собираем ICE кандидаты
        // Фильтруем локальные candidates, так как сервер не может их обработать
        const candidates: RTCIceCandidateInit[] = [];
        
        // Функция для проверки, является ли candidate локальным
        const isLocalCandidate = (candidate: string): boolean => {
          // Пропускаем candidates с .local доменом (mDNS)
          if (candidate.includes('.local')) return true;
          
          // Пропускаем локальные IP адреса (127.0.0.1, 192.168.x.x, 10.x.x.x, 172.16-31.x.x)
          const localIpPatterns = [
            /127\.\d+\.\d+\.\d+/,           // 127.x.x.x
            /192\.168\.\d+\.\d+/,           // 192.168.x.x
            /10\.\d+\.\d+\.\d+/,            // 10.x.x.x
            /172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/, // 172.16-31.x.x
            /::1/,                          // IPv6 localhost
            /fe80:/,                        // IPv6 link-local
          ];
          
          return localIpPatterns.some(pattern => pattern.test(candidate));
        };
        
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            logger.info('[VideoStream]', `ICE candidate received: ${event.candidate.type} - ${event.candidate.candidate.substring(0, 80)}...`);
            
            // Пропускаем локальные candidates, так как сервер не может их обработать
            if (isLocalCandidate(event.candidate.candidate)) {
              logger.info('[VideoStream]', 'Skipping local candidate:', event.candidate.candidate.substring(0, 100));
              return;
            }
            
            candidates.push({
              candidate: event.candidate.candidate,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              sdpMid: event.candidate.sdpMid,
            });
            logger.info('[VideoStream]', `Added candidate (${candidates.length} total): ${event.candidate.type}`);
          } else {
            logger.info('[VideoStream]', `ICE gathering complete. Total candidates: ${candidates.length}`);
            
            // ВАЖНО: Если политика relay, но кандидатов нет, это проблема с TURN сервером
            if (icePolicy === 'relay' && candidates.length === 0) {
              logger.error('[VideoStream]', '⚠️ CRITICAL: No ICE candidates collected with relay policy!');
              logger.error('[VideoStream]', 'TURN server may be unreachable. Check:');
              logger.error('[VideoStream]', `  1. TURN server URL: ${turnServer || 'NOT SET'}`);
              logger.error('[VideoStream]', `  2. TURN server must be accessible from browser (use external IP/domain, not Docker container name)`);
              logger.error('[VideoStream]', `  3. TURN server ports must be open (3478 TCP/UDP, 49152-65535 UDP)`);
            }
          }
        };
        
        // Обработчик ошибок ICE gathering
        pc.onicegatheringstatechange = () => {
          logger.info('[VideoStream]', `ICE gathering state: ${pc.iceGatheringState}`);
          if (pc.iceGatheringState === 'complete') {
            logger.info('[VideoStream]', `Final candidate count: ${candidates.length}`);
          }
        };

        // Создаем offer
        logger.info('[VideoStream]', 'Creating offer...');
        const offer = await pc.createOffer({ 
          offerToReceiveAudio: true, 
          offerToReceiveVideo: true 
        });
        await pc.setLocalDescription(offer);
        logger.success('[VideoStream]', 'Local description set');

        // Ждем сбора ICE кандидатов
        // Согласно документации: собираем до завершения или таймаута
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (pc.iceGatheringState === 'complete') {
              clearInterval(checkInterval);
              resolve(null);
            }
          }, 100);
          // Таймаут 3 секунды (можно настроить)
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve(null);
          }, 3000);
        });

        logger.info('[VideoStream]', `Collected ${candidates.length} ICE candidates`);

        // Преобразуем URL из WebSocket формата в HTTP POST формат
        // Согласно документации: /websocket/media/proxy/api/signalling/... -> /api/rs/media/proxy/media/...
        let httpSignallingUrl = streamUrl;
        
        // Если URL содержит /websocket/, преобразуем его
        if (httpSignallingUrl.includes('/websocket/media/proxy/api/signalling/')) {
          // Извлекаем ID и параметры
          const urlMatch = httpSignallingUrl.match(/\/websocket\/media\/proxy\/api\/signalling\/([^?]+)(\?.*)?/);
          if (urlMatch) {
            const streamId = urlMatch[1];
            const queryString = urlMatch[2] || '';
            
            // Парсим query параметры
            // ВАЖНО: для HTTP POST signature также может быть нужен, поэтому сохраняем все параметры
            const urlObj = new URL(`http://dummy${queryString}`);
            const params = new URLSearchParams();
            
            // Сохраняем все параметры, включая signature (сервер может требовать его даже для HTTP POST)
            urlObj.searchParams.forEach((value, key) => {
              params.set(key, value);
            });
            
            const queryParams = params.toString() ? `?${params.toString()}` : '';
            
            // Преобразуем в формат /api/rs/media/proxy/media/{id}_callParticipant{params}
            // Согласно примеру из документации: /api/rs/media/proxy/media/9c437e9c-8828-45f0-a12c-7451fe733776_callParticipant?server=...
            httpSignallingUrl = `/api/rs/media/proxy/media/${streamId}_callParticipant${queryParams}`;
            logger.info('[VideoStream]', `Converted WebSocket URL to HTTP format: ${httpSignallingUrl.substring(0, 150)}...`);
          } else {
            // Fallback: просто убираем /websocket/
            httpSignallingUrl = httpSignallingUrl.replace('/websocket/', '/');
            logger.info('[VideoStream]', `Fallback conversion: ${httpSignallingUrl.substring(0, 150)}...`);
          }
        } else if (httpSignallingUrl.includes('/api/rs/media/proxy/media/')) {
          // URL уже в HTTP формате - проверяем, что он содержит все необходимые параметры
          // Если signature отсутствует в URL, но был в оригинальном streamUrl, нужно его добавить
          logger.info('[VideoStream]', 'URL already in HTTP format');
          
          // Проверяем, есть ли signature в URL
          const urlObj = new URL(`http://dummy${httpSignallingUrl}`);
          if (!urlObj.searchParams.has('signature') && streamUrl.includes('signature=')) {
            // Если signature был в оригинальном URL, но отсутствует в HTTP формате, добавляем его
            const originalUrlObj = new URL(`http://dummy${streamUrl}`);
            const signature = originalUrlObj.searchParams.get('signature');
            if (signature) {
              urlObj.searchParams.set('signature', signature);
              httpSignallingUrl = urlObj.pathname + (urlObj.search ? urlObj.search : '');
              logger.info('[VideoStream]', 'Added signature to HTTP URL');
            }
          }
        }

        // Используем наш API proxy для отправки signalling запроса на бэкенд
        // Формат согласно OpenAPI: { sdp, content, candidates }
        // ВАЖНО: encodeURIComponent правильно кодирует URL, включая query параметры
        // Next.js автоматически декодирует его в proxy, поэтому signature должен сохраниться
        const proxyUrl = `/api/media/signalling?path=${encodeURIComponent(httpSignallingUrl)}`;

        // Проверяем, что signature присутствует в URL перед отправкой
        const urlCheck = new URL(`http://dummy${httpSignallingUrl}`);
        const signature = urlCheck.searchParams.get('signature');
        const hasSignature = !!signature;
        
        if (!hasSignature) {
          logger.warn('[VideoStream]', '⚠️ Signature missing in URL before sending!');
        } else {
          logger.info('[VideoStream]', `Signature present in URL: ${signature.substring(0, 20)}...`);
        }

        const signallingMessage = {
          sdp: pc.localDescription?.sdp,
          content: 'PRIMARY',
          candidates: candidates,
        };

        // Формируем заголовки
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Session': localStorage.getItem('session_id') || '',
        };
        
        // ВАЖНО: Некоторые бэкенды могут требовать signature в заголовке
        // Передаем signature в заголовке тоже, если он есть
        if (signature) {
          headers['X-Signature'] = signature;
          headers['Signature'] = signature;
        }

        logger.info('[VideoStream]', `Sending HTTP POST via proxy to: ${httpSignallingUrl.substring(0, 100)}...`);

        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(signallingMessage),
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('[VideoStream]', `HTTP ${response.status}: ${errorText}`);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        logger.success('[VideoStream]', 'HTTP POST successful, reading streaming response...');

        // Читаем ответ потоком (SDP answer и candidates)
        // Согласно документации: сначала приходит SDP answer, затем кандидаты по одному
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (!reader) {
          throw new Error('Response body is not readable');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Парсим JSON объекты из буфера (каждая строка - отдельный JSON объект)
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                // Received from server

                // Обрабатываем SDP answer
                if (data.sdp && typeof data.sdp === 'string') {
                  logger.success('[VideoStream]', 'Received SDP answer from server');
                  try {
                    await pc.setRemoteDescription(new RTCSessionDescription({
                      type: 'answer',
                      sdp: data.sdp,
                    }));
                    logger.success('[VideoStream]', 'Remote description set successfully');
                    
                    // Применяем сохраненные треки, если они были получены до установки remote description
                    if (pendingTracks.length > 0 && videoRef.current) {
                      logger.info('[VideoStream]', `Applying ${pendingTracks.length} pending track(s)`);
                      videoRef.current.srcObject = pendingTracks[0];
                      logger.success('[VideoStream]', 'Pending track applied to video element');
                      
                      // Пытаемся запустить воспроизведение
                      videoRef.current.play().then(() => {
                        logger.success('[VideoStream]', 'Video play() succeeded after applying pending track');
                      }).catch((err: any) => {
                        logger.warn('[VideoStream]', 'Video play() failed after pending track (may need user interaction):', err.message);
                      });
                      
                      pendingTracks = [];
                    } else if (!videoRef.current) {
                      logger.error('[VideoStream]', 'Video ref is null when trying to apply pending tracks!');
                    }
                  } catch (sdpErr: any) {
                    logger.error('[VideoStream]', 'Error setting remote description:', sdpErr);
                    throw sdpErr;
                  }
                }

                // Обрабатываем ICE кандидаты (приходят по одному)
                // Формат: { candidate: { sdpMLineIndex, sdpMid, candidate } }
                if (data.candidate) {
                  // Received ICE candidate from server
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    // ICE candidate added successfully
                  } catch (candErr: any) {
                    logger.warn('[VideoStream]', 'Error adding ICE candidate:', candErr);
                    // Не прерываем процесс, продолжаем обработку
                  }
                }
              } catch (parseErr: any) {
                logger.warn('[VideoStream]', 'Failed to parse line:', line, parseErr);
              }
            }
          }
        }

        // Обрабатываем оставшиеся данные в буфере
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer);
            if (data.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: data.sdp,
              }));
            }
            if (data.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
          } catch (parseErr) {
            logger.warn('[VideoStream]', 'Failed to parse remaining buffer:', buffer);
          }
        }

        logger.success('[VideoStream]', 'HTTP signalling completed, connection established');

      } catch (err: any) {
        logger.error('[VideoStream]', 'WebRTC signalling error:', err);
        if (mounted) {
          setError(err.message || 'Ошибка установки соединения');
          setIsConnecting(false);
        }
      }
    };

    // Всегда используем HTTP POST WebRTC signalling
    setupWebRTCSignalling();

    // Cleanup
    return () => {
      mounted = false;
      logger.cleanup('[VideoStream]', 'Closing connections');
      
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [streamUrl, participantName]);

  return (
    <div className={`relative bg-gray-900 rounded-lg overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-cover"
        onLoadedMetadata={async () => {
          // Явно вызываем play() после загрузки метаданных
          if (videoRef.current) {
            try {
              await videoRef.current.play();
            } catch (err: any) {
              // Если автовоспроизведение заблокировано, это нормально - пользователь может запустить вручную
            }
          }
        }}
        onCanPlay={async () => {
          // Также пробуем запустить воспроизведение при canPlay
          if (videoRef.current && videoRef.current.paused) {
            try {
              await videoRef.current.play();
            } catch (err: any) {
              // Игнорируем ошибки автовоспроизведения
            }
          }
        }}
        onPlay={() => {
          logger.success('[VideoStream]', 'Video started playing');
          setIsConnecting(false);
        }}
        onPause={() => {
          logger.info('[VideoStream]', 'Video paused');
        }}
        onPlaying={() => {
          logger.success('[VideoStream]', 'Video is now playing');
          setIsConnecting(false);
        }}
        onError={(e) => {
          const error = e.currentTarget.error;
          logger.error('[VideoStream]', 'Video element error:', {
            code: error?.code,
            message: error?.message,
            networkState: e.currentTarget.networkState,
            readyState: e.currentTarget.readyState,
          });
          setError(`Ошибка воспроизведения видео: ${error?.message || 'Неизвестная ошибка'}`);
          setIsConnecting(false);
        }}
        onStalled={() => {
          logger.warn('[VideoStream]', 'Video stalled');
        }}
        onWaiting={() => {
          logger.info('[VideoStream]', 'Video waiting for data');
        }}
      />
      
      {/* Overlay для имени участника */}
      {participantName && (
        <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white text-sm px-3 py-1 rounded">
          {participantName}
        </div>
      )}

      {/* Индикатор загрузки */}
      {isConnecting && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-2"></div>
            <p className="text-white text-sm">Подключение...</p>
          </div>
        </div>
      )}

      {/* Ошибка */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-center px-4">
            <svg className="w-12 h-12 text-red-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-white text-sm">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
