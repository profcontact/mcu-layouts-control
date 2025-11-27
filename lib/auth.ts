import { authAPI } from './api';

export const isAuthenticated = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('auth_token');
};

// requireAuth больше не используется, так как проверка авторизации
// выполняется напрямую в компонентах через isAuthenticated() и router.push
// Эта функция оставлена для обратной совместимости, но не должна вызывать перезагрузку
export const requireAuth = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  
  const token = localStorage.getItem('auth_token');
  return !!token;
};

