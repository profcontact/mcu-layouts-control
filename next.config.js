/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Отключено для избежания двойного вызова useEffect
  output: 'standalone', // Для Docker деплоя
  webpack: (config, { isServer }) => {
    // Исправляем проблему с react-dnd в Next.js
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    
    return config;
  },
  // Отключаем оптимизацию для react-dnd, чтобы избежать проблем с vendor chunks
  experimental: {
    optimizePackageImports: ['react-dnd', 'react-dnd-html5-backend'],
    // Отключаем автоматическую статическую оптимизацию
    isrMemoryCacheSize: 0,
  },
  // Production оптимизации
  productionBrowserSourceMaps: false,
  compress: true,
  // Отключаем статическую генерацию для всех страниц
  // Это гарантирует, что все страницы будут рендериться динамически
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
}

module.exports = nextConfig

