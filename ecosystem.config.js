module.exports = {
  apps: [{
    name: 'mcu-layout',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: process.cwd(),
    instances: 2, // Количество инстансов (рекомендуется 2 для балансировки)
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G',
    watch: false,
    ignore_watch: [
      'node_modules',
      '.next',
      'logs',
      '.git'
    ],
    // Автоматический перезапуск при изменении файлов (только в development)
    watch_options: {
      followSymlinks: false
    }
  }]
};

