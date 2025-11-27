// Пример использования метода получения списка раскладок

import { layoutAPI } from '@/lib/api';

// Пример функции для получения и отображения списка раскладок
export async function fetchAndDisplayLayouts() {
  try {
    // Получаем список всех раскладок
    const layouts = await layoutAPI.getLayouts();
    
    console.log('Список раскладок:', layouts);
    
    // Обрабатываем каждую раскладку
    layouts.forEach((layout) => {
      console.log(`Раскладка ID: ${layout.id}, Название: ${layout.name}`);
      if (layout.description) {
        console.log(`Описание: ${layout.description}`);
      }
      if (layout.cells) {
        console.log(`Количество ячеек: ${layout.cells.length}`);
      }
    });
    
    return layouts;
  } catch (error) {
    console.error('Ошибка при получении списка раскладок:', error);
    throw error;
  }
}

// Пример использования в React компоненте:
/*
'use client';

import { useEffect, useState } from 'react';
import { layoutAPI, Layout } from '@/lib/api';

export default function LayoutsList() {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadLayouts = async () => {
      try {
        const data = await layoutAPI.getLayouts();
        setLayouts(data);
      } catch (err: any) {
        setError(err.message || 'Ошибка загрузки раскладок');
      } finally {
        setLoading(false);
      }
    };

    loadLayouts();
  }, []);

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div>Ошибка: {error}</div>;

  return (
    <div>
      <h2>Список раскладок</h2>
      <ul>
        {layouts.map((layout) => (
          <li key={layout.id}>
            <strong>{layout.name}</strong>
            {layout.description && <p>{layout.description}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
*/

