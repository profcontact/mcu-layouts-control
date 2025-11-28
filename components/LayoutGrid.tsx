'use client';

import { useState, useEffect, useRef } from 'react';
import { useDrop, useDrag } from 'react-dnd';
import type { LayoutCell, Participant, CellType } from '@/lib/api';

interface LayoutGridProps {
  cells: LayoutCell[];
  participants: Participant[];
  onDrop: (participantId: string, cellId: string, originalCellId?: string) => void;
  onRemove?: (cellId: string) => void;
  onCellTypeChange?: (cellId: string, cellType: CellType) => void;
  onSpeakerIndexChange?: (cellId: string, speakerIndex: number) => void;
  gridCols?: number;
  gridRows?: number;
  showNames?: boolean;
}

export default function LayoutGrid({
  cells,
  participants,
  onDrop,
  onRemove,
  onCellTypeChange,
  onSpeakerIndexChange,
  gridCols = 4,
  gridRows = 3,
  showNames = true,
}: LayoutGridProps) {
  const getParticipant = (participantId?: string) => {
    if (!participantId) return undefined;
    const found = participants.find((p) => p.id === participantId);
    if (!found) {
      // Participant not found - это нормально, если участник еще не загружен
    }
    return found;
  };

  const getCellStyle = (cell: LayoutCell) => {
    // Если есть прямые проценты из cellConfiguration, используем их
    if (cell.left !== undefined && cell.top !== undefined && cell.widthPercent !== undefined && cell.heightPercent !== undefined) {
      return {
        position: 'absolute' as const,
        left: `${cell.left}%`,
        top: `${cell.top}%`,
        width: `${cell.widthPercent}%`,
        height: `${cell.heightPercent}%`,
      };
    }
    
    // Иначе используем расчет на основе row/col/width/height
    const cellWidth = (cell.width / gridCols) * 100;
    const cellHeight = (cell.height / gridRows) * 100;
    const left = (cell.col / gridCols) * 100;
    const top = (cell.row / gridRows) * 100;

    return {
      position: 'absolute' as const,
      left: `${left}%`,
      top: `${top}%`,
      width: `${cellWidth}%`,
      height: `${cellHeight}%`,
    };
  };

  return (
    <div className="w-full h-full relative">
      {cells.map((cell, index) => (
        <LayoutCell
          key={cell.id}
          cell={cell}
          participant={getParticipant(cell.participantId)}
          onDrop={onDrop}
          onRemove={onRemove}
          onCellTypeChange={onCellTypeChange}
          onSpeakerIndexChange={onSpeakerIndexChange}
          style={getCellStyle(cell)}
          showNames={showNames}
          cellNumber={index + 1}
        />
      ))}
    </div>
  );
}

function LayoutCell({
  cell,
  participant,
  onDrop,
  onRemove,
  onCellTypeChange,
  onSpeakerIndexChange,
  style,
  showNames = true,
  cellNumber,
}: {
  cell: LayoutCell;
  participant?: Participant;
  onDrop: (participantId: string, cellId: string, originalCellId?: string) => void;
  onRemove?: (cellId: string) => void;
  onCellTypeChange?: (cellId: string, cellType: CellType) => void;
  onSpeakerIndexChange?: (cellId: string, speakerIndex: number) => void;
  style: React.CSSProperties;
  showNames?: boolean;
  cellNumber?: number;
}) {
  const [showCellTypeMenu, setShowCellTypeMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const cellTypes: { value: CellType; label: string }[] = [
    { value: 'EMPTY', label: 'Пустая' },
    { value: 'AUTO', label: 'Авто' },
    { value: 'CAROUSEL', label: 'Карусель' },
    // { value: 'FIXED', label: 'Фиксированная' },
    // { value: 'PICTURE', label: 'Изображение' },
    { value: 'SPEAKER', label: 'Докладчик' },
    { value: 'PREVIOUS_SPEAKER', label: 'Предыдущий докладчик' },
  ];

  const getCellTypeLabel = (type?: CellType) => {
    return cellTypes.find(t => t.value === type)?.label || 'Пустая';
  };

  // Закрываем меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowCellTypeMenu(false);
      }
    };

    if (showCellTypeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showCellTypeMenu]);

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ['participant', 'participantInCell'],
    drop: (item: { id: string; participant: Participant; originalCellId?: string }) => {
      onDrop(item.id, cell.id, item.originalCellId);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  return (
    <div
      ref={drop as unknown as React.Ref<HTMLDivElement>}
      style={style}
      className={`border transition-all relative group ${
        isOver && canDrop
          ? 'border-blue-500 border-2'
          : participant
          ? 'border-[#2a2f4a]'
          : 'border-dashed border-[#2a2f4a] border-2'
      }`}
    >
      {/* Номер ячейки - только если пустая */}
      {!participant && cellNumber && (
        <div className="absolute top-2 left-2 w-6 h-6 bg-[#1a1f3a] text-gray-400 rounded-full flex items-center justify-center text-xs font-semibold z-10 border border-[#2a2f4a]">
          {cellNumber}
        </div>
      )}
      {participant ? (
        <ParticipantInCell
          participant={participant}
          cellId={cell.id}
          onRemove={onRemove}
          showNames={showNames}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#0f1322]/80 backdrop-blur-sm text-gray-500 text-xs relative">
          {isOver && canDrop ? (
            <div className="text-blue-400">Отпустите здесь</div>
          ) : (
            <>
              {onCellTypeChange && (
                <div ref={menuRef} className="absolute top-2 right-2 z-20 flex flex-col items-end gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCellTypeMenu(!showCellTypeMenu);
                    }}
                    className="px-2 py-1 bg-[#1a1f3a] border border-[#2a2f4a] rounded text-xs text-gray-300 hover:bg-[#2a2f4a] transition-colors"
                    title="Выбрать тип ячейки"
                  >
                    {getCellTypeLabel(cell.cellType)}
                  </button>
                  {showCellTypeMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-[#1a1f3a] border border-[#2a2f4a] rounded shadow-lg z-30 min-w-[180px]">
                      {cellTypes.map((type) => (
                        <button
                          key={type.value}
                          onClick={(e) => {
                            e.stopPropagation();
                            onCellTypeChange(cell.id, type.value);
                            setShowCellTypeMenu(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-[#0f1322] transition-colors ${
                            cell.cellType === type.value
                              ? 'text-blue-400 bg-[#0f1322]'
                              : 'text-gray-300'
                          }`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Поле для ввода номера докладчика только для типа SPEAKER */}
                  {cell.cellType === 'SPEAKER' && onSpeakerIndexChange && (
                    <div className="flex items-center gap-1 bg-[#1a1f3a] border border-[#2a2f4a] rounded px-2 py-1">
                      <label className="text-xs text-gray-400">№:</label>
                      <input
                        type="number"
                        min="0"
                        max="5"
                        value={cell.speakerIndex ?? 0}
                        onChange={(e) => {
                          e.stopPropagation();
                          const value = Math.max(0, Math.min(5, parseInt(e.target.value) || 0));
                          onSpeakerIndexChange(cell.id, value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-10 px-1 py-0.5 bg-[#0f1322] border border-[#2a2f4a] rounded text-xs text-white text-center focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ParticipantInCell({
  participant,
  cellId,
  onRemove,
  showNames,
}: {
  participant: Participant;
  cellId: string;
  onRemove?: (cellId: string) => void;
  showNames: boolean;
}) {
  const [{ isDragging }, drag] = useDrag({
    type: 'participantInCell',
    item: { id: participant.id, participant, originalCellId: cellId },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <div
      ref={drag as unknown as React.Ref<HTMLDivElement>}
      className={`w-full h-full bg-[#1a1f3a]/20 backdrop-blur-sm flex flex-col items-center justify-center cursor-move relative ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(cellId);
          }}
          className="absolute top-2 right-2 w-6 h-6 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs hover:bg-red-700 z-20"
          title="Удалить участника"
        >
          ×
        </button>
      )}
      
      {/* Аватар участника */}
      <div className="mb-2">
        {participant.avatar ? (
          <img
            src={participant.avatar}
            alt={participant.name}
            className="w-20 h-20 rounded-full object-cover"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-2xl">
            {participant.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Иконки статуса медиа */}
      <div className="flex items-center space-x-2 mb-1">
        {/* Иконка микрофона */}
        <svg 
          className={`w-4 h-4 ${
            participant.mediaState === 'AUDIO' || participant.mediaState === 'AUDIO_VIDEO'
              ? 'text-green-500' 
              : 'text-gray-400'
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
              : 'text-gray-400'
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
      </div>

      {/* Имя участника */}
      {showNames && (
        <p className="text-xs font-medium text-white text-center truncate w-full px-2">
          {participant.name}
        </p>
      )}
    </div>
  );
}
