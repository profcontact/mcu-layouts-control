'use client';

import { useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';

interface VideoStreamProps {
  streamUrl: string;
  protocol?: 'WEBRTC' | 'WEBRTC2' | string;
  participantName?: string;
  muted?: boolean;
  className?: string;
}

type SignallingProtocol = 'WEBRTC' | 'WEBRTC2';

function resolveSignallingProtocol(streamUrl: string, provided?: string): SignallingProtocol {
  const normalizedProvided = provided?.toUpperCase();
  if (normalizedProvided === 'WEBRTC' || normalizedProvided === 'WEBRTC2') {
    return normalizedProvided;
  }

  // Если URL содержит /websocket/, это WebRTC2
  const url = streamUrl.toLowerCase();
  if (url.includes('/websocket/')) {
    return 'WEBRTC2';
  }

  // По умолчанию WebRTC (HTTP POST)
  return 'WEBRTC';
}

/**
 * Компонент для отображения WebRTC видео-трансляции
 * Поддерживает как HTTP POST (WebRTC), так и WebSocket (WebRTC2) signalling
 */
export default function VideoStream({
  streamUrl,
  protocol,
  participantName,
  muted = false,
  className = '',
}: VideoStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
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
    const selectedProtocol = resolveSignallingProtocol(streamUrl, protocol);
    logger.info('[VideoStream]', `Selected signalling protocol: ${selectedProtocol}`);

    const setupWebRTCSignalling = async () => {
      try {
        logger.info('[VideoStream]', 'Setting up WebRTC HTTP POST signalling...');
        logger.info('[VideoStream]', `Stream URL: ${streamUrl.substring(0, 150)}...`);

        // Создаем RTCPeerConnection
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });

        pcRef.current = pc;

        // Обработчик входящих треков
        // Важно: треки могут прийти до установки remote description
        let pendingTracks: MediaStream[] = [];
        pc.ontrack = (event) => {
          logger.success('[VideoStream]', `Received track: ${event.track.kind} (${event.track.id})`);
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
              }
            }
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
        const candidates: RTCIceCandidateInit[] = [];
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            candidates.push({
              candidate: event.candidate.candidate,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              sdpMid: event.candidate.sdpMid,
            });
          } else {
            logger.info('[VideoStream]', `ICE gathering complete. Total candidates: ${candidates.length}`);
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
            
            // Парсим query параметры и убираем signature (он нужен только для WebSocket)
            const urlObj = new URL(`http://dummy${queryString}`);
            const params = new URLSearchParams();
            
            // Сохраняем только нужные параметры (server и другие, кроме signature)
            urlObj.searchParams.forEach((value, key) => {
              if (key !== 'signature') {
                params.set(key, value);
              }
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
          logger.info('[VideoStream]', 'URL already in HTTP format');
        }

        // Используем наш API proxy для отправки signalling запроса на бэкенд
        // Формат согласно OpenAPI: { sdp, content, candidates }
        const proxyUrl = `/api/media/signalling?path=${encodeURIComponent(httpSignallingUrl)}`;

        const signallingMessage = {
          sdp: pc.localDescription?.sdp,
          content: 'PRIMARY',
          candidates: candidates,
        };

        logger.info('[VideoStream]', `Sending HTTP POST via proxy to: ${httpSignallingUrl.substring(0, 100)}...`);

        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Session': localStorage.getItem('session_id') || '',
          },
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
                      pendingTracks = [];
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

    const setupWebSocketSignalling = async () => {
      let pendingTracks: MediaStream[] = [];

      try {
        logger.info('[VideoStream]', `Connecting to ${participantName || 'stream'}...`);
        logger.info('[VideoStream]', 'Using WebSocket signalling (WebRTC2)');

        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });

        pcRef.current = pc;

        pc.ontrack = (event) => {
          logger.success('[VideoStream]', `Received track: ${event.track.kind} (id: ${event.track.id})`);
          logger.info('[VideoStream]', `Track details:`, {
            kind: event.track.kind,
            id: event.track.id,
            enabled: event.track.enabled,
            readyState: event.track.readyState,
            streamsCount: event.streams.length,
            hasRemoteDescription: !!pc.remoteDescription,
          });
          
          if (event.streams && event.streams.length > 0) {
            const stream = event.streams[0];
            logger.info('[VideoStream]', `Track stream ID: ${stream.id}, tracks: ${stream.getTracks().map(t => `${t.kind}:${t.id}`).join(', ')}`);
            
            // Применяем трек к video элементу
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              logger.success('[VideoStream]', 'Video stream applied to video element');
              
              // Проверяем, что video элемент готов к воспроизведению
              videoRef.current.onloadedmetadata = async () => {
                logger.success('[VideoStream]', 'Video metadata loaded');
                if (mounted) {
                  setIsConnecting(false);
                }
                // Явно вызываем play() после загрузки метаданных
                if (videoRef.current) {
                  try {
                    await videoRef.current.play();
                    logger.success('[VideoStream]', 'Video play() called after metadata loaded');
                  } catch (err: any) {
                    logger.warn('[VideoStream]', 'Video play() failed after metadata (may be blocked):', err.message);
                  }
                }
              };
              
              videoRef.current.oncanplay = async () => {
                logger.success('[VideoStream]', 'Video can play (from ontrack handler)');
                // Также пробуем запустить воспроизведение при canPlay
                if (videoRef.current && videoRef.current.paused) {
                  try {
                    await videoRef.current.play();
                    logger.success('[VideoStream]', 'Video play() called on canPlay (from ontrack handler)');
                  } catch (err: any) {
                    logger.warn('[VideoStream]', 'Video play() failed on canPlay (from ontrack handler):', err.message);
                  }
                }
              };
              
              videoRef.current.onplay = () => {
                logger.success('[VideoStream]', 'Video started playing (from ontrack handler)');
              };
              
              videoRef.current.onplaying = () => {
                logger.success('[VideoStream]', 'Video is now playing (from ontrack handler)');
              };
              
              videoRef.current.onerror = (err) => {
                logger.error('[VideoStream]', 'Video element error:', err);
              };
            } else {
              logger.warn('[VideoStream]', 'Video ref is null, storing track');
              pendingTracks.push(stream);
            }
          }
        };

        pc.oniceconnectionstatechange = () => {
          logger.info('[VideoStream]', `ICE connection state: ${pc.iceConnectionState}`);
          logger.info('[VideoStream]', 'Full connection state:', {
            iceConnectionState: pc.iceConnectionState,
            connectionState: pc.connectionState,
            signalingState: pc.signalingState,
            iceGatheringState: pc.iceGatheringState,
          });
          
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            if (mounted) {
              logger.success('[VideoStream]', 'ICE connection established');
              setIsConnecting(false);
              
              // Проверяем, есть ли треки
              if (pc.getReceivers().length > 0) {
                logger.info('[VideoStream]', `Active receivers: ${pc.getReceivers().length}`);
                pc.getReceivers().forEach((receiver, index) => {
                  logger.info('[VideoStream]', `Receiver ${index}:`, {
                    track: receiver.track ? `${receiver.track.kind} (${receiver.track.id})` : 'no track',
                    transport: receiver.transport ? 'has transport' : 'no transport',
                  });
                });
              } else {
                logger.warn('[VideoStream]', 'No receivers found after connection');
              }
            }
          } else if (pc.iceConnectionState === 'failed') {
            if (mounted) {
              logger.error('[VideoStream]', 'ICE connection failed');
              setError('Не удалось установить соединение');
              setIsConnecting(false);
            }
          }
        };

        pc.onconnectionstatechange = () => {
          logger.info('[VideoStream]', `Connection state: ${pc.connectionState}`);
        };

        const buildWebSocketUrl = () => {
          const ensureContentType = (rawUrl: string) => {
            const urlObj = new URL(rawUrl);
            if (!urlObj.searchParams.has('contentType')) {
              urlObj.searchParams.set('contentType', 'CONFERENCE_PARTICIPANT_PRIMARY');
            }
            const sessionId = typeof window !== 'undefined' ? localStorage.getItem('session_id') : null;
            if (sessionId && !urlObj.searchParams.has('Session')) {
              urlObj.searchParams.set('Session', sessionId);
            }
            return urlObj.toString();
          };

          const trimmedUrl = streamUrl.trim();
          if (trimmedUrl.startsWith('ws://') || trimmedUrl.startsWith('wss://')) {
            return ensureContentType(trimmedUrl);
          }

          if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
            const parsed = new URL(trimmedUrl);
            parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
            return ensureContentType(parsed.toString());
          }

          const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const hostFromEnv = process.env.NEXT_PUBLIC_WS_HOST;
          const host = hostFromEnv && hostFromEnv.length > 0 ? hostFromEnv : window.location.host;
          const normalizedPath = trimmedUrl.startsWith('/') ? trimmedUrl : `/${trimmedUrl}`;
          return ensureContentType(`${wsProtocol}//${host}${normalizedPath}`);
        };

        const wsUrl = buildWebSocketUrl();
        logger.info('[VideoStream]', `Connecting to WebSocket: ${wsUrl.substring(0, 150)}...`);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        const candidates: RTCIceCandidateInit[] = [];
        let iceGatheringComplete = false;
        let offerSent = false;

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            candidates.push({
              candidate: event.candidate.candidate,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              sdpMid: event.candidate.sdpMid,
            });
          } else {
            iceGatheringComplete = true;
            logger.info('[VideoStream]', `ICE gathering complete. Total candidates: ${candidates.length}`);
            if (offerSent && ws.readyState === WebSocket.OPEN) {
              if (candidates.length > 0) {
                logger.info('[VideoStream]', 'Sending remaining ICE candidates');
                ws.send(JSON.stringify({ candidates: candidates }));
              }
            }
          }
        };

        ws.onopen = async () => {
          logger.success('[VideoStream]', 'WebSocket connected');
          
          try {
            logger.info('[VideoStream]', 'Creating offer for WebRTC2...');
            
            const offer = await pc.createOffer({ 
              offerToReceiveAudio: true, 
              offerToReceiveVideo: true 
            });
            await pc.setLocalDescription(offer);
            logger.success('[VideoStream]', 'Local description set');
            
            const waitForIce = new Promise<void>((resolve) => {
              const checkInterval = setInterval(() => {
                if (iceGatheringComplete || pc.iceGatheringState === 'complete') {
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 100);
              setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
              }, 3000);
            });
            
            await waitForIce;
            logger.info('[VideoStream]', `Collected ${candidates.length} ICE candidates`);
            
            // Отправляем offer с SDP и candidates
            // Пробуем разные форматы, начиная с простого
            const offerMessage = {
              sdp: offer.sdp,
              content: 'PRIMARY',
              candidates: candidates,
            };
            
            logger.info('[VideoStream]', 'Sending offer to server');
            
            ws.send(JSON.stringify(offerMessage));
            offerSent = true;
          } catch (err: any) {
            logger.error('[VideoStream]', 'Error creating/sending offer:', err);
            if (mounted) {
              setError(`Ошибка создания offer: ${err.message}`);
              setIsConnecting(false);
            }
          }
        };

        ws.onmessage = async (event) => {
          try {
            logger.info('[VideoStream]', '📨 Received message from server');
            
            let data: any;
            try {
              data = JSON.parse(event.data);
            } catch (parseErr) {
              logger.warn('[VideoStream]', 'Failed to parse message as JSON:', event.data);
              return;
            }
            
            // Обрабатываем SDP answer (может быть в разных полях)
            let sdpAnswer: string | null = null;
            if (data.sdp && typeof data.sdp === 'string') {
              sdpAnswer = data.sdp;
            } else if (data.sessionDescription && typeof data.sessionDescription === 'string') {
              sdpAnswer = data.sessionDescription;
            } else if (data.answer && typeof data.answer === 'string') {
              sdpAnswer = data.answer;
            }
            
            if (sdpAnswer) {
              logger.success('[VideoStream]', 'Received SDP answer from server');
              try {
                await pc.setRemoteDescription(new RTCSessionDescription({
                  type: 'answer',
                  sdp: sdpAnswer,
                }));
                logger.success('[VideoStream]', 'Remote description set successfully');
                logger.info('[VideoStream]', 'Connection state after setting remote description:', {
                  iceConnectionState: pc.iceConnectionState,
                  connectionState: pc.connectionState,
                  signalingState: pc.signalingState,
                  receiversCount: pc.getReceivers().length,
                });
                
                // Проверяем треки после установки remote description
                if (pc.getReceivers().length > 0) {
                  logger.info('[VideoStream]', `Found ${pc.getReceivers().length} receiver(s) after setting remote description`);
                  pc.getReceivers().forEach((receiver, index) => {
                    if (receiver.track) {
                      logger.info('[VideoStream]', `Receiver ${index} track: ${receiver.track.kind} (${receiver.track.id}), enabled: ${receiver.track.enabled}`);
                    }
                  });
                }
                
                // Применяем сохраненные треки, если они были получены до установки remote description
                if (pendingTracks.length > 0 && videoRef.current) {
                  logger.info('[VideoStream]', `Applying ${pendingTracks.length} pending track(s)`);
                  videoRef.current.srcObject = pendingTracks[0];
                  pendingTracks = [];
                } else if (videoRef.current && !videoRef.current.srcObject) {
                  // Если треки еще не пришли, проверяем через небольшую задержку
                  setTimeout(() => {
                    if (pc.getReceivers().length > 0 && videoRef.current && !videoRef.current.srcObject) {
                      logger.info('[VideoStream]', 'Attempting to get stream from receivers');
                      const receivers = pc.getReceivers();
                      for (const receiver of receivers) {
                        if (receiver.track && receiver.track.kind === 'video') {
                          const stream = new MediaStream([receiver.track]);
                          videoRef.current.srcObject = stream;
                          logger.success('[VideoStream]', 'Created stream from receiver track');
                          break;
                        }
                      }
                    }
                  }, 500);
                }
              } catch (sdpErr: any) {
                logger.error('[VideoStream]', 'Error setting remote description:', sdpErr);
                throw sdpErr;
              }
            }

            // Обрабатываем ICE кандидаты
            if (data.candidates && Array.isArray(data.candidates)) {
              logger.info('[VideoStream]', `Received ${data.candidates.length} ICE candidates`);
              for (const cand of data.candidates) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch (candErr: any) {
                  logger.warn('[VideoStream]', 'Error adding ICE candidate:', candErr);
                }
              }
            } else if (data.candidate) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (candErr: any) {
                logger.warn('[VideoStream]', 'Error adding ICE candidate:', candErr);
              }
            }
            
            // Игнорируем неизвестные поля
          } catch (err: any) {
            logger.error('[VideoStream]', 'Error processing message:', err);
            if (mounted && !error) {
              setError(`Ошибка обработки сообщения: ${err.message}`);
            }
          }
        };

        ws.onerror = (error) => {
          logger.error('[VideoStream]', 'WebSocket error:', error);
          if (mounted) {
            setError('Ошибка WebSocket соединения');
            setIsConnecting(false);
          }
        };

        ws.onclose = (event) => {
          logger.info('[VideoStream]', `WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
          if (mounted && event.code !== 1000) {
            setError(`WebSocket закрыт: ${event.reason || 'Неизвестная причина'}`);
            setIsConnecting(false);
          }
        };

      } catch (err: any) {
        logger.error('[VideoStream]', 'Setup error:', err);
        if (mounted) {
          setError(err.message || 'Ошибка подключения');
          setIsConnecting(false);
        }
      }
    };

    if (selectedProtocol === 'WEBRTC2') {
      setupWebSocketSignalling();
    } else {
      setupWebRTCSignalling();
    }

    // Cleanup
    return () => {
      mounted = false;
      logger.cleanup('[VideoStream]', 'Closing connections');
      
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [streamUrl, participantName, protocol]);

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
        }}
        onPause={() => {
          logger.info('[VideoStream]', 'Video paused');
        }}
        onPlaying={() => {
          logger.success('[VideoStream]', 'Video is now playing');
        }}
        onError={(e) => {
          logger.error('[VideoStream]', 'Video element error:', e);
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
