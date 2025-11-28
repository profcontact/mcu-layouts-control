// Утилиты для работы с раскладками и cellMapping

import { LayoutCell, CellType } from './api';

export interface CellConfiguration {
  cellNumber: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CellMapping {
  cellNumber: number;
  cellType?: string;
  participantId?: string;
  speakerIndex?: number;
}

export interface LayoutConfiguration {
  cellConfiguration?: CellConfiguration[];
  cellMapping?: CellMapping[];
}

export interface LayoutData {
  layoutId?: number;
  showNames?: boolean;
  layoutConfiguration?: LayoutConfiguration;
  cells?: LayoutCell[];
}

/**
 * Преобразует cellConfiguration в массив LayoutCell
 */
export function cellConfigurationToLayoutCells(
  cellConfiguration: CellConfiguration[],
  cellMapping?: Map<number, CellMapping>
): LayoutCell[] {
  // Сортируем по cellNumber
  const sorted = [...cellConfiguration].sort((a, b) => a.cellNumber - b.cellNumber);

  return sorted.map((cellConfig) => {
    const mapping = cellMapping?.get(cellConfig.cellNumber);
    const participantId = mapping?.participantId;

    return {
      id: `cell-${cellConfig.cellNumber}`,
      row: 0, // Не используется при наличии left/top
      col: 0,
      width: 1,
      height: 1,
      left: cellConfig.left,
      top: cellConfig.top,
      widthPercent: cellConfig.width,
      heightPercent: cellConfig.height,
      participantId,
      cellType: mapping?.cellType === 'FIXED' ? undefined : (mapping?.cellType as CellType),
      speakerIndex:
        mapping?.cellType === 'SPEAKER' || mapping?.cellType === 'PREVIOUS_SPEAKER'
          ? mapping.speakerIndex
          : undefined,
    };
  });
}

/**
 * Преобразует старый формат cells с учетом cellMapping
 */
export function mergeCellsWithMapping(
  cells: LayoutCell[],
  cellMapping: CellMapping[]
): LayoutCell[] {
  const cellMappingMap = new Map(cellMapping.map((cell) => [cell.cellNumber, cell]));

  return cells.map((cell, index) => {
    const cellNumber = index + 1;
    const mapping = cellMappingMap.get(cellNumber);

    return {
      ...cell,
      participantId: mapping?.participantId || cell.participantId,
      cellType:
        mapping?.cellType === 'FIXED'
          ? undefined
          : (mapping?.cellType as CellType) || cell.cellType,
      speakerIndex:
        mapping?.cellType === 'SPEAKER' || mapping?.cellType === 'PREVIOUS_SPEAKER'
          ? mapping.speakerIndex
          : cell.speakerIndex,
    };
  });
}

/**
 * Создает дефолтную раскладку (сетка 4x3)
 */
export function createDefaultLayout(rows: number = 3, cols: number = 4): LayoutCell[] {
  const cells: LayoutCell[] = [];

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
}

/**
 * Создает простую раскладку на основе cellMapping (когда структуры нет)
 */
export function createLayoutFromMapping(
  cellMapping: CellMapping[],
  cols: number = 4
): LayoutCell[] {
  return cellMapping.map((cell) => {
    const cellIndex = cell.cellNumber - 1;
    const row = Math.floor(cellIndex / cols);
    const col = cellIndex % cols;

    return {
      id: `cell-${row}-${col}`,
      row,
      col,
      width: 1,
      height: 1,
      participantId: cell.participantId,
      cellType: cell.cellType !== 'FIXED' ? (cell.cellType as CellType) : undefined,
      speakerIndex:
        cell.cellType === 'SPEAKER' || cell.cellType === 'PREVIOUS_SPEAKER'
          ? cell.speakerIndex
          : undefined,
    };
  });
}

/**
 * Основная функция для обработки данных раскладки с сервера
 */
export async function processLayoutData(
  layoutDataRaw: any,
  getLayoutById: (id: number) => Promise<any>
): Promise<{ cells: LayoutCell[]; layoutId: number | null; showNames: boolean }> {
  let layoutData: LayoutCell[] = [];
  let layoutId: number | null = null;
  let showNames = true;

  // Если это массив ячеек (старый формат)
  if (Array.isArray(layoutDataRaw)) {
    return { cells: layoutDataRaw, layoutId: null, showNames: true };
  }

  // Если это не объект, возвращаем пустую раскладку
  if (typeof layoutDataRaw !== 'object' || !layoutDataRaw) {
    return { cells: [], layoutId: null, showNames: true };
  }

  const layoutObj = layoutDataRaw as LayoutData;

  // Извлекаем layoutId и showNames
  layoutId = layoutObj.layoutId || null;
  if (layoutObj.showNames !== undefined) {
    showNames = layoutObj.showNames;
  }

  // Обрабатываем cellMapping из layoutConfiguration
  const cellMapping = layoutObj.layoutConfiguration?.cellMapping;
  
  if (cellMapping && Array.isArray(cellMapping)) {
    cellMapping.sort((a, b) => a.cellNumber - b.cellNumber);

    // Загружаем структуру раскладки если есть layoutId
    let layoutStructure: any = null;
    if (layoutId) {
      try {
        layoutStructure = await getLayoutById(layoutId);
      } catch (err) {
        console.warn('Could not load layout settings:', err);
      }
    }

    // Если есть cellConfiguration в layoutStructure
    if (layoutStructure?.layoutConfiguration?.cellConfiguration) {
      const cellMappingMap = new Map(cellMapping.map((cell) => [cell.cellNumber, cell]));
      layoutData = cellConfigurationToLayoutCells(
        layoutStructure.layoutConfiguration.cellConfiguration,
        cellMappingMap
      );
    }
    // Если есть cells в layoutStructure (старый формат)
    else if (layoutStructure?.cells && Array.isArray(layoutStructure.cells)) {
      layoutData = mergeCellsWithMapping(layoutStructure.cells, cellMapping);
    }
    // Если структуры нет, создаем на основе cellMapping
    else {
      layoutData = createLayoutFromMapping(cellMapping);
    }
  }
  // Если есть cells напрямую (старый формат)
  else if (layoutObj.cells && Array.isArray(layoutObj.cells)) {
    layoutData = layoutObj.cells;
  }
  // Если есть только layoutId, загружаем структуру
  else if (layoutId) {
    try {
      const layoutStructure = await getLayoutById(layoutId);

      if (layoutStructure?.layoutConfiguration?.cellConfiguration) {
        layoutData = cellConfigurationToLayoutCells(
          layoutStructure.layoutConfiguration.cellConfiguration
        );
      } else if (layoutStructure?.cells && Array.isArray(layoutStructure.cells)) {
        layoutData = layoutStructure.cells;
      }
    } catch (err) {
      console.warn('Could not load layout structure:', err);
    }
  }

  return { cells: layoutData, layoutId, showNames };
}

/**
 * Создает cellMapping для отправки на сервер
 */
export function createCellMappingForAPI(layout: LayoutCell[]): Array<{
  cellNumber: number;
  cellType: string;
  participantId?: string;
  speakerIndex?: number;
}> {
  return layout
    .map((cell, index) => {
      const cellNumber = index + 1;

      // Ячейка с участником - тип FIXED
      if (cell.participantId) {
        return {
          cellNumber,
          cellType: 'FIXED',
          participantId: cell.participantId,
        };
      }

      // Пустая ячейка - используем cellType или EMPTY по умолчанию
      const cellType = cell.cellType || 'EMPTY';

      // Пропускаем ячейки с типом AUTO
      if (cellType === 'AUTO') {
        return null;
      }

      // Для типа SPEAKER добавляем speakerIndex
      if (cellType === 'SPEAKER') {
        return {
          cellNumber,
          cellType,
          speakerIndex: cell.speakerIndex ?? 0,
        };
      }

      return {
        cellNumber,
        cellType,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

