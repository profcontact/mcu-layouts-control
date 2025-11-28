// Утилита для повторных попыток с экспоненциальной задержкой

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 5,
  initialDelay: 1000,
  maxDelay: 5000,
  shouldRetry: () => true,
  onRetry: () => {},
};

/**
 * Выполняет функцию с повторными попытками при ошибке
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      // Задержка перед повторной попыткой (кроме первой)
      if (attempt > 0) {
        const delay = Math.min(
          opts.initialDelay * Math.pow(2, attempt - 1),
          opts.maxDelay
        );
        await sleep(delay);
      }

      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Если это последняя попытка, выбрасываем ошибку
      if (attempt === opts.maxAttempts - 1) {
        throw lastError;
      }

      // Проверяем, нужно ли повторять
      if (!opts.shouldRetry(lastError)) {
        throw lastError;
      }

      // Вызываем колбэк перед повторной попыткой
      opts.onRetry(attempt + 1, lastError);
    }
  }

  // На всякий случай (не должно достигаться)
  throw lastError || new Error('Retry failed');
}

/**
 * Ждет указанное количество миллисекунд
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Создает функцию shouldRetry для проверки конкретных ошибок
 */
export function shouldRetryOn(...errorMessages: string[]): (error: Error) => boolean {
  return (error: Error) => {
    const message = error.message.toLowerCase();
    return errorMessages.some((msg) => message.includes(msg.toLowerCase()));
  };
}

/**
 * Ждет выполнения условия с таймаутом
 */
export async function waitFor(
  condition: () => boolean,
  options: {
    timeout?: number;
    interval?: number;
    timeoutError?: string;
  } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100, timeoutError = 'Timeout waiting for condition' } = options;
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error(timeoutError);
    }
    await sleep(interval);
  }
}

