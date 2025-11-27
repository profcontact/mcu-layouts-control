'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated } from '@/lib/auth';
import { getAuthHeaders } from '@/lib/api';

interface ApiEndpoint {
  path: string;
  method: string;
  summary?: string;
  operationId?: string;
  parameters?: any[];
  requestBody?: any;
}

export default function ApiTestPage() {
  const router = useRouter();
  const [openApiSpec, setOpenApiSpec] = useState<any>(null);
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [queryParams, setQueryParams] = useState<Record<string, string>>({});
  const [requestBody, setRequestBody] = useState<string>('');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    // Загружаем OpenAPI спецификацию
    fetch('/clients-openapi.json')
      .then((res) => res.json())
      .then((data) => {
        setOpenApiSpec(data);
        // Парсим эндпоинты из спецификации
        const parsedEndpoints: ApiEndpoint[] = [];
        if (data.paths) {
          Object.entries(data.paths).forEach(([path, methods]: [string, any]) => {
            Object.entries(methods).forEach(([method, details]: [string, any]) => {
              parsedEndpoints.push({
                path,
                method: method.toUpperCase(),
                summary: details.summary,
                operationId: details.operationId,
                parameters: details.parameters,
                requestBody: details.requestBody,
              });
            });
          });
        }
        setEndpoints(parsedEndpoints);
      })
      .catch((err) => {
        console.error('Error loading OpenAPI spec:', err);
        setError('Ошибка загрузки OpenAPI спецификации');
      });
  }, [router]);

  const handleEndpointSelect = (endpoint: ApiEndpoint) => {
    setSelectedEndpoint(endpoint);
    setPathParams({});
    setQueryParams({});
    setRequestBody('');
    setResponse(null);
    setError('');

    // Инициализируем path параметры
    if (endpoint.parameters) {
      const pathParams: Record<string, string> = {};
      endpoint.parameters
        .filter((p: any) => p.in === 'path')
        .forEach((p: any) => {
          pathParams[p.name] = '';
        });
      setPathParams(pathParams);

      // Инициализируем query параметры
      const queryParams: Record<string, string> = {};
      endpoint.parameters
        .filter((p: any) => p.in === 'query')
        .forEach((p: any) => {
          queryParams[p.name] = '';
        });
      setQueryParams(queryParams);
    }
  };

  const buildUrl = (): string => {
    if (!selectedEndpoint) return '';

    let url = selectedEndpoint.path;
    // Заменяем path параметры
    Object.entries(pathParams).forEach(([key, value]) => {
      url = url.replace(`{${key}}`, value);
    });

    // Добавляем query параметры
    const queryString = Object.entries(queryParams)
      .filter(([_, value]) => value.trim() !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    return queryString ? `${url}?${queryString}` : url;
  };

  const handleSendRequest = async () => {
    if (!selectedEndpoint) return;

    setLoading(true);
    setError('');
    setResponse(null);

    try {
      const url = buildUrl();
      const fullUrl = `/api/proxy${url}`;

      const authHeaders = getAuthHeaders();
      console.log('Client auth headers:', authHeaders);

      const options: RequestInit = {
        method: selectedEndpoint.method,
        headers: {
          ...authHeaders,
          // Убеждаемся, что заголовки передаются правильно
          'Content-Type': 'application/json',
        },
      };

      // Добавляем body для POST, PUT, PATCH
      if (['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) && requestBody.trim()) {
        try {
          options.body = JSON.stringify(JSON.parse(requestBody));
        } catch (e) {
          setError('Неверный формат JSON в теле запроса');
          setLoading(false);
          return;
        }
      }

      console.log('Sending request to:', fullUrl);
      console.log('Request options:', { method: options.method, headers: options.headers });

      const res = await fetch(fullUrl, options);
      const data = await res.json();

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        data,
      });
    } catch (err: any) {
      setError(err.message || 'Ошибка выполнения запроса');
    } finally {
      setLoading(false);
    }
  };

  const filteredEndpoints = endpoints.filter((endpoint) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      endpoint.path.toLowerCase().includes(search) ||
      endpoint.summary?.toLowerCase().includes(search) ||
      endpoint.operationId?.toLowerCase().includes(search) ||
      endpoint.method.toLowerCase().includes(search)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-800">Тестирование API</h1>
          </div>
          <nav className="flex space-x-4 border-b border-gray-200">
            <Link
              href="/conferences"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-indigo-600 border-b-2 border-transparent hover:border-indigo-600 transition-colors"
            >
              Конференции
            </Link>
            <Link
              href="/layouts"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-indigo-600 border-b-2 border-transparent hover:border-indigo-600 transition-colors"
            >
              Раскладки
            </Link>
            <Link
              href="/api-test"
              className="px-4 py-2 text-sm font-medium text-indigo-600 border-b-2 border-indigo-600"
            >
              Тест API
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Список эндпоинтов */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Эндпоинты</h2>
              <input
                type="text"
                placeholder="Поиск..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 text-gray-900"
              />
              <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                {filteredEndpoints.map((endpoint, index) => (
                  <button
                    key={`${endpoint.path}-${endpoint.method}-${index}`}
                    onClick={() => handleEndpointSelect(endpoint)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedEndpoint?.path === endpoint.path &&
                      selectedEndpoint?.method === endpoint.method
                        ? 'bg-indigo-100 border-2 border-indigo-500'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded ${
                          endpoint.method === 'GET'
                            ? 'bg-blue-100 text-blue-800'
                            : endpoint.method === 'POST'
                            ? 'bg-green-100 text-green-800'
                            : endpoint.method === 'PUT'
                            ? 'bg-yellow-100 text-yellow-800'
                            : endpoint.method === 'DELETE'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {endpoint.method}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {endpoint.path}
                    </div>
                    {endpoint.summary && (
                      <div className="text-xs text-gray-500 mt-1">{endpoint.summary}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Форма запроса */}
          <div className="lg:col-span-2">
            {selectedEndpoint ? (
              <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 mb-2">
                    {selectedEndpoint.method} {selectedEndpoint.path}
                  </h2>
                  {selectedEndpoint.summary && (
                    <p className="text-sm text-gray-600">{selectedEndpoint.summary}</p>
                  )}
                </div>

                {/* Path параметры */}
                {Object.keys(pathParams).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Path параметры</h3>
                    <div className="space-y-2">
                      {Object.entries(pathParams).map(([key, value]) => (
                        <div key={key}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {key}
                          </label>
                          <input
                            type="text"
                            value={value}
                            onChange={(e) =>
                              setPathParams({ ...pathParams, [key]: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                            placeholder={`Введите ${key}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Query параметры */}
                {Object.keys(queryParams).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Query параметры</h3>
                    <div className="space-y-2">
                      {Object.entries(queryParams).map(([key, value]) => (
                        <div key={key}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {key}
                          </label>
                          <input
                            type="text"
                            value={value}
                            onChange={(e) =>
                              setQueryParams({ ...queryParams, [key]: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                            placeholder={`Введите ${key}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Request Body */}
                {['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Request Body</h3>
                    <textarea
                      value={requestBody}
                      onChange={(e) => setRequestBody(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm text-gray-900"
                      rows={10}
                      placeholder='{"key": "value"}'
                    />
                  </div>
                )}

                {/* URL Preview */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">URL</h3>
                  <div className="bg-gray-50 p-3 rounded-lg font-mono text-sm text-gray-800 break-all">
                    {buildUrl() || selectedEndpoint.path}
                  </div>
                </div>

                {/* Кнопка отправки */}
                <button
                  onClick={handleSendRequest}
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Отправка...' : 'Отправить запрос'}
                </button>

                {/* Ошибки */}
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                {/* Ответ */}
                {response && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Ответ</h3>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="mb-2">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            response.status >= 200 && response.status < 300
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {response.status} {response.statusText}
                        </span>
                      </div>
                      <pre className="text-xs text-gray-700 overflow-auto max-h-96">
                        {JSON.stringify(response.data, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
                Выберите эндпоинт из списка слева
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

