/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Отключено для избежания двойного вызова useEffect
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
  },
  // Production оптимизации
  productionBrowserSourceMaps: false,
  compress: true,
}

module.exports = nextConfig

