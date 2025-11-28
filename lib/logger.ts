// Утилита для логирования с уровнями и возможностью отключения в production

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private isEnabled(): boolean {
    // В production отключаем DEBUG логи
    if (typeof window !== 'undefined') {
      // Клиентская сторона
      return process.env.NODE_ENV !== 'production' || this.level >= LogLevel.INFO;
    }
    // Серверная сторона
    return process.env.NODE_ENV !== 'production' || this.level >= LogLevel.INFO;
  }

  private log(level: LogLevel, prefix: string, emoji: string, ...args: any[]): void {
    if (!this.isEnabled() || level < this.level) return;

    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const message = `[${timestamp}] ${prefix} ${emoji}`;

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(message, ...args);
        break;
      case LogLevel.INFO:
        console.log(message, ...args);
        break;
      case LogLevel.WARN:
        console.warn(message, ...args);
        break;
      case LogLevel.ERROR:
        console.error(message, ...args);
        break;
    }
  }

  debug(prefix: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, prefix, '🔍', ...args);
  }

  info(prefix: string, ...args: any[]): void {
    this.log(LogLevel.INFO, prefix, '✅', ...args);
  }

  warn(prefix: string, ...args: any[]): void {
    this.log(LogLevel.WARN, prefix, '⚠️', ...args);
  }

  error(prefix: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, prefix, '❌', ...args);
  }

  // Специализированные методы для разных типов операций
  render(component: string, count: number): void {
    this.debug(`[${component}]`, `🔄 Render #${count}`);
  }

  effect(component: string, message: string): void {
    this.debug(`[${component}]`, `🎯 ${message}`);
  }

  loading(component: string, message: string): void {
    this.info(`[${component}]`, `🚀 ${message}`);
  }

  success(component: string, message: string): void {
    this.info(`[${component}]`, `✅ ${message}`);
  }

  abort(component: string, message: string): void {
    this.warn(`[${component}]`, `🛑 ${message}`);
  }

  cleanup(component: string, message: string): void {
    this.debug(`[${component}]`, `🧹 ${message}`);
  }

  api(method: string, endpoint: string, status?: number): void {
    if (status) {
      this.info('[API]', `${method} ${endpoint} - ${status}`);
    } else {
      this.debug('[API]', `${method} ${endpoint}`);
    }
  }

  ws(message: string, ...args: any[]): void {
    this.info('[WebSocket]', message, ...args);
  }

  event(category: string, name: string, details?: any): void {
    this.info(`[Event:${category}]`, name, details || '');
  }
}

// Экспортируем синглтон
// В production используем INFO уровень, в development - DEBUG
export const logger = new Logger(
  process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG
);

// Экспортируем удобные функции для импорта
export const {
  debug,
  info,
  warn,
  error,
  render,
  effect,
  loading,
  success,
  abort,
  cleanup,
  api,
  ws,
  event,
} = logger;

