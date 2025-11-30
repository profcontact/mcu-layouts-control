# Инструкция по развертыванию MCU Layout

Данная инструкция описывает процесс развертывания приложения MCU Layout в production окружении с использованием PM2 и Nginx.

## 📋 Требования

- Ubuntu/Debian сервер (или другой Linux дистрибутив)
- Node.js 18+ установлен
- PM2 установлен глобально
- Nginx установлен и настроен
- Домен или IP адрес для доступа к приложению
- SSL сертификат (для HTTPS, рекомендуется Let's Encrypt)

## 🔧 Установка зависимостей

### 1. Установка Node.js 18+

```bash
# Используя nvm (рекомендуется)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# Или используя NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Установка PM2

```bash
sudo npm install -g pm2
```

### 3. Установка Nginx

```bash
sudo apt update
sudo apt install nginx
```

## 📦 Развертывание приложения

### 1. Клонирование и подготовка проекта

```bash
# Перейдите в директорию для приложений
cd /var/www
sudo mkdir -p mcu-layout
sudo chown $USER:$USER mcu-layout
cd mcu-layout

# Клонируйте репозиторий
git clone <repository-url> .

# Или скопируйте файлы проекта в эту директорию
```

### 2. Установка зависимостей

```bash
npm install --production
```

### 3. Настройка переменных окружения

Создайте файл `.env.local` в корне проекта:

```bash
nano .env.local
```

Добавьте следующие переменные:

```env
# REST API URL
API_URL=https://your-api-domain.com/api/rest

# WebSocket host для server-side (с протоколом)
WS_HOST=wss://your-ws-domain.com

# WebSocket host для клиента (только домен)
NEXT_PUBLIC_WS_HOST=your-ws-domain.com

# WebRTC ICE Transport Policy (опционально)
# "all" - все кандидаты (host, srflx, relay) - по умолчанию, с фильтрацией локальных адресов
# "relay" - только relay кандидаты через TURN (исключает локальные адреса, требует TURN сервер)
# NEXT_PUBLIC_WEBRTC_ICE_POLICY=relay

# Node environment
NODE_ENV=production
```

**Важно:** 
- Замените `your-api-domain.com` и `your-ws-domain.com` на ваши реальные домены.
- Если используете `NEXT_PUBLIC_WEBRTC_ICE_POLICY=relay`, убедитесь, что у вас настроен TURN сервер в `components/VideoStream.tsx`.

### 4. Сборка приложения

```bash
npm run build
```

### 5. Создание PM2 конфигурации

Создайте файл `ecosystem.config.js` в корне проекта:

```bash
nano ecosystem.config.js
```

Добавьте следующую конфигурацию:

```javascript
module.exports = {
  apps: [{
    name: 'mcu-layout',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    // cwd будет автоматически установлен в директорию, где находится этот файл
    instances: 2, // Количество инстансов (рекомендуется 2 для балансировки)
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/pm2/mcu-layout-error.log',
    out_file: '/var/log/pm2/mcu-layout-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G',
    watch: false,
    ignore_watch: ['node_modules', '.next']
  }]
};
```

### 6. Создание директории для логов

```bash
sudo mkdir -p /var/log/pm2
sudo chown $USER:$USER /var/log/pm2
```

### 7. Запуск приложения через PM2

**Важно:** 
- Убедитесь, что вы находитесь в директории проекта при запуске PM2. PM2 автоматически использует директорию, где находится `ecosystem.config.js`, как рабочую директорию приложения.
- **Перед запуском PM2 обязательно выполните сборку приложения** (`npm run build`), иначе приложение не запустится.

```bash
# Убедитесь, что вы в директории проекта
cd /var/www/mcu-layout

# Убедитесь, что приложение собрано (если еще не собрано)
npm run build

# Запуск приложения
pm2 start ecosystem.config.js

# Сохранение конфигурации PM2 (для автозапуска после перезагрузки)
pm2 save
pm2 startup
# Выполните команду, которую выведет pm2 startup
```

### 8. Проверка статуса

```bash
# Проверка статуса приложения
pm2 status

# Просмотр логов
pm2 logs mcu-layout

# Мониторинг
pm2 monit
```

## 🌐 Настройка Nginx

### 1. Создание конфигурации Nginx

Создайте файл конфигурации:

```bash
sudo nano /etc/nginx/sites-available/mcu-layout
```

Добавьте следующую конфигурацию:

```nginx
# Редирект HTTP на HTTPS
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    # Редирект на HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS конфигурация
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL сертификаты (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Логи
    access_log /var/log/nginx/mcu-layout-access.log;
    error_log /var/log/nginx/mcu-layout-error.log;

    # Максимальный размер загружаемых файлов
    client_max_body_size 10M;

    # Проксирование к Next.js приложению
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты для WebSocket и длительных запросов
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Server-Sent Events (SSE) для WebSocket Event Channel
    location /api/websocket/event-channel {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Настройки для SSE
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
        
        # Заголовки для SSE
        add_header Cache-Control 'no-cache';
        add_header X-Accel-Buffering 'no';
    }

    # WebRTC signalling (длинные запросы)
    location /api/media/signalling {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Увеличенные таймауты для WebRTC signalling
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # Отключаем буферизацию для streaming ответов
        proxy_buffering off;
        proxy_cache off;
    }

    # Статические файлы (опционально, для кэширования)
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable";
    }
}
```

**Важно:** Замените `your-domain.com` на ваш реальный домен.

### 2. Активация конфигурации

```bash
# Создание символической ссылки
sudo ln -s /etc/nginx/sites-available/mcu-layout /etc/nginx/sites-enabled/

# Проверка конфигурации
sudo nginx -t

# Перезагрузка Nginx
sudo systemctl reload nginx
```

## 🔒 Настройка SSL сертификата (Let's Encrypt)

### 1. Установка Certbot

```bash
sudo apt install certbot python3-certbot-nginx
```

### 2. Получение сертификата

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot автоматически обновит конфигурацию Nginx и настроит автоматическое обновление сертификата.

### 3. Проверка автоматического обновления

```bash
sudo certbot renew --dry-run
```

## 🔄 Управление приложением

### PM2 команды

```bash
# Перезапуск приложения
pm2 restart mcu-layout

# Остановка приложения
pm2 stop mcu-layout

# Запуск приложения
pm2 start mcu-layout

# Просмотр логов
pm2 logs mcu-layout

# Просмотр логов в реальном времени
pm2 logs mcu-layout --lines 100

# Мониторинг
pm2 monit

# Перезагрузка без простоя
pm2 reload mcu-layout

# Удаление из PM2
pm2 delete mcu-layout
```

### Обновление приложения

```bash
# Перейдите в директорию проекта
cd /var/www/mcu-layout

# Остановите приложение
pm2 stop mcu-layout

# Получите последние изменения
git pull origin main

# Установите зависимости (если изменились)
npm install --production

# Пересоберите приложение
npm run build

# Запустите приложение
pm2 start mcu-layout

# Или используйте reload для перезапуска без простоя
pm2 reload mcu-layout
```

### Nginx команды

```bash
# Проверка конфигурации
sudo nginx -t

# Перезагрузка Nginx
sudo systemctl reload nginx

# Перезапуск Nginx
sudo systemctl restart nginx

# Статус Nginx
sudo systemctl status nginx

# Просмотр логов
sudo tail -f /var/log/nginx/mcu-layout-access.log
sudo tail -f /var/log/nginx/mcu-layout-error.log
```

## 📊 Мониторинг и логи

### PM2 мониторинг

```bash
# Веб-интерфейс PM2 (опционально)
pm2 web

# Доступен на http://localhost:9615
```

### Логи приложения

```bash
# PM2 логи
pm2 logs mcu-layout

# Nginx логи
sudo tail -f /var/log/nginx/mcu-layout-access.log
sudo tail -f /var/log/nginx/mcu-layout-error.log

# Системные логи
journalctl -u nginx -f
```

## 🔧 Оптимизация производительности

### 1. Настройка PM2

В `ecosystem.config.js` можно настроить:
- `instances` - количество инстансов (рекомендуется 2-4 для многоядерных серверов)
- `max_memory_restart` - автоматический перезапуск при превышении памяти

### 2. Настройка Nginx

Добавьте в секцию `http` в `/etc/nginx/nginx.conf`:

```nginx
# Кэширование
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=nextjs_cache:10m max_size=100m inactive=60m;

# Сжатие
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
```

### 3. Настройка системы

```bash
# Увеличение лимита файловых дескрипторов
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf
```

## 🐛 Решение проблем

### Приложение не запускается

1. Проверьте логи PM2:
```bash
pm2 logs mcu-layout --err
```

2. Проверьте переменные окружения:
```bash
pm2 env mcu-layout
```

3. Проверьте порт:
```bash
netstat -tulpn | grep 3000
```

### Nginx возвращает 502 Bad Gateway

1. Проверьте, что приложение запущено:
```bash
pm2 status
```

2. Проверьте, что приложение слушает на порту 3000:
```bash
curl http://localhost:3000
```

3. Проверьте логи Nginx:
```bash
sudo tail -f /var/log/nginx/mcu-layout-error.log
```

### WebSocket/SSE не работает

1. Проверьте таймауты в Nginx конфигурации
2. Убедитесь, что `proxy_buffering off` установлен для SSE
3. Проверьте логи браузера (F12) на наличие ошибок

### Проблемы с SSL

1. Проверьте сертификат:
```bash
sudo certbot certificates
```

2. Обновите сертификат вручную:
```bash
sudo certbot renew
```

## 📝 Чек-лист развертывания

- [ ] Node.js 18+ установлен
- [ ] PM2 установлен и настроен
- [ ] Nginx установлен и настроен
- [ ] SSL сертификат получен и настроен
- [ ] Переменные окружения настроены в `.env.local`
- [ ] Приложение собрано (`npm run build`)
- [ ] PM2 конфигурация создана и приложение запущено
- [ ] Nginx конфигурация создана и активирована
- [ ] Приложение доступно по HTTPS
- [ ] Логи настроены и проверены
- [ ] Автозапуск PM2 настроен (`pm2 startup`)

## 🔐 Безопасность

### Рекомендации:

1. **Firewall**: Настройте UFW или iptables для ограничения доступа
2. **Обновления**: Регулярно обновляйте систему и зависимости
3. **Мониторинг**: Настройте мониторинг приложения (PM2 Plus, или другие инструменты)
4. **Резервное копирование**: Настройте регулярное резервное копирование данных
5. **Логи**: Регулярно проверяйте логи на наличие подозрительной активности

### Настройка Firewall

#### Определение используемого файрвола

Сначала определите, какой файрвол используется на вашем сервере:

```bash
# Проверка UFW
which ufw
# Если команда найдена, используется UFW

# Проверка firewalld
which firewall-cmd
# Если команда найдена, используется firewalld

# Проверка iptables
which iptables
# Если команда найдена, используется iptables
```

#### Вариант 1: UFW (Ubuntu/Debian)

```bash
# Установка UFW (если не установлен)
sudo apt update
sudo apt install ufw

# Разрешить SSH
sudo ufw allow 22/tcp

# Разрешить HTTP и HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# WebRTC: Разрешить UDP порты для медиа-трафика
# WebRTC использует UDP для передачи аудио/видео данных
# Диапазон портов для WebRTC обычно 10000-20000, но может варьироваться
sudo ufw allow 10000:20000/udp

# Если используется TURN сервер, откройте его порты:
sudo ufw allow 3478/udp
sudo ufw allow 49152:65535/udp

# Включить firewall
sudo ufw enable

# Проверить статус
sudo ufw status
```

#### Вариант 2: firewalld (CentOS/RHEL/Fedora)

```bash
# Проверить статус
sudo systemctl status firewalld

# Если firewalld не запущен, запустите его
sudo systemctl start firewalld
sudo systemctl enable firewalld

# Разрешить HTTP и HTTPS
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https

# WebRTC: Разрешить UDP порты для медиа-трафика
sudo firewall-cmd --permanent --add-port=10000-20000/udp

# Если используется TURN сервер:
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=49152-65535/udp

# Применить изменения
sudo firewall-cmd --reload

# Проверить статус
sudo firewall-cmd --list-all
```

#### Вариант 3: iptables (прямое управление)

```bash
# Разрешить HTTP и HTTPS
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# WebRTC: Разрешить UDP порты для медиа-трафика
sudo iptables -A INPUT -p udp --dport 10000:20000 -j ACCEPT

# Если используется TURN сервер:
sudo iptables -A INPUT -p udp --dport 3478 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 49152:65535 -j ACCEPT

# Сохранить правила (зависит от дистрибутива)
# Для Ubuntu/Debian:
sudo iptables-save > /etc/iptables/rules.v4

# Для CentOS/RHEL:
sudo service iptables save
# или
sudo /usr/libexec/iptables/iptables.init save

# Проверить правила
sudo iptables -L -n
```

**Примечание:** Если у вас есть TURN сервер, откройте его порты отдельно. Стандартные порты TURN:
- 3478/udp (STUN/TURN)
- 49152-65535/udp (медиа-трафик TURN)

### Настройка Nginx для WebRTC

Добавьте следующие настройки в конфигурацию Nginx для улучшения работы WebRTC:

```nginx
# В блоке server добавьте:

# Увеличенные буферы для WebRTC signalling
client_body_buffer_size 128k;
client_max_body_size 10M;

# Настройки для WebRTC streaming
proxy_request_buffering off;
proxy_buffering off;
proxy_http_version 1.1;

# WebRTC signalling - дополнительные настройки
location /api/media/signalling {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Увеличенные таймауты для WebRTC signalling
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    
    # Отключаем буферизацию для streaming ответов
    proxy_buffering off;
    proxy_cache off;
    
    # Дополнительные заголовки для WebRTC
    proxy_set_header Connection '';
    add_header Cache-Control 'no-cache';
    add_header X-Accel-Buffering 'no';
}
```

## 🎯 Настройка TURN сервера для WebRTC

TURN (Traversal Using Relays around NAT) сервер необходим для установки WebRTC соединений в сложных сетевых условиях (NAT, файрволы). Он также решает проблему с локальными ICE candidates.

### Установка coturn (TURN/STUN сервер)

#### Для Ubuntu/Debian:

```bash
# Установка coturn
sudo apt update
sudo apt install coturn

# Включить автозапуск
sudo systemctl enable coturn
```

#### Для CentOS/RHEL:

```bash
# Установка coturn
sudo yum install coturn
# или для новых версий:
sudo dnf install coturn

# Включить автозапуск
sudo systemctl enable coturn
```

### Конфигурация coturn

1. **Отредактируйте конфигурационный файл:**

```bash
sudo nano /etc/turnserver.conf
```

2. **Добавьте следующие настройки:**

```conf
# Слушать на всех интерфейсах
listening-port=3478
listening-ip=0.0.0.0

# Внешний IP адрес сервера (замените на ваш реальный IP)
external-ip=YOUR_SERVER_IP

# Если сервер находится за NAT, используйте:
# external-ip=INTERNAL_IP/EXTERNAL_IP

# Реалм (домен или имя сервера)
realm=your-domain.com

# Пользователи для TURN (username:password)
# Рекомендуется использовать временные учетные данные
user=turnuser:turnpassword

# Диапазон портов для медиа-трафика
min-port=49152
max-port=65535

# Логирование
log-file=/var/log/turn.log
verbose

# Безопасность
no-cli
no-tls
no-dtls

# Отключить мультикаст
no-multicast-peers

# Разрешить только relay (рекомендуется для безопасности)
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
```

3. **Запустите coturn:**

```bash
# Запустить сервис
sudo systemctl start coturn

# Проверить статус
sudo systemctl status coturn

# Проверить логи
sudo tail -f /var/log/turn.log
```

### Настройка файрвола для TURN

Откройте порты для TURN сервера (см. раздел "Настройка Firewall"):

```bash
# Для firewalld:
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=3478/tcp
sudo firewall-cmd --permanent --add-port=49152-65535/udp
sudo firewall-cmd --reload

# Для iptables:
sudo iptables -A INPUT -p udp --dport 3478 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3478 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 49152:65535 -j ACCEPT
```

### Интеграция TURN сервера в приложение

1. **Добавьте переменные окружения в `.env.local`:**

```env
# TURN сервер настройки
NEXT_PUBLIC_TURN_SERVER=turn:your-turn-server.com:3478
NEXT_PUBLIC_TURN_USERNAME=turnuser
NEXT_PUBLIC_TURN_PASSWORD=turnpassword

# Использовать только relay кандидаты (рекомендуется)
NEXT_PUBLIC_WEBRTC_ICE_POLICY=relay
```

2. **Обновите `components/VideoStream.tsx` для использования переменных окружения:**

TURN сервер уже поддерживается через переменные окружения. Убедитесь, что в коде есть:

```typescript
const turnServer = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_SERVER : null;
const turnUsername = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_USERNAME : null;
const turnPassword = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_PASSWORD : null;

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

if (turnServer && turnUsername && turnPassword) {
  iceServers.push({
    urls: turnServer,
    username: turnUsername,
    credential: turnPassword,
  });
}
```

3. **Пересоберите приложение:**

```bash
npm run build -- --webpack
pm2 restart mcu-layout
```

### Альтернатива: Использование публичного TURN сервера

Если у вас нет возможности настроить собственный TURN сервер, можно использовать публичные сервисы (не рекомендуется для продакшена):

- **Twilio STUN/TURN**: https://www.twilio.com/stun-turn
- **Xirsys**: https://xirsys.com/

## 🔧 Устранение проблем с WebRTC

### Проблема: Ошибка "Failed to read connection-address and port from the candidate attribute"

Эта ошибка возникает, когда сервер получает ICE candidates с локальными адресами (например, `.local` домены), которые он не может обработать.

**Решение 1: Использовать iceTransportPolicy: "relay" (рекомендуется)**

Если у вас настроен TURN сервер, используйте только relay кандидаты:

1. Настройте TURN сервер (см. раздел "Настройка TURN сервера для WebRTC")

2. В `.env.local` добавьте:
```env
NEXT_PUBLIC_WEBRTC_ICE_POLICY=relay
NEXT_PUBLIC_TURN_SERVER=turn:your-turn-server.com:3478
NEXT_PUBLIC_TURN_USERNAME=turnuser
NEXT_PUBLIC_TURN_PASSWORD=turnpassword
```

3. Пересоберите приложение:
```bash
npm run build -- --webpack
pm2 restart mcu-layout
```

**Решение 2: Фильтрация локальных кандидатов (по умолчанию)**

Приложение уже фильтрует локальные кандидаты (`.local`, `127.x.x.x`, `192.168.x.x`, и т.д.). Если ошибка все еще возникает:

1. Убедитесь, что код обновлен:
```bash
git pull origin main
npm run build
pm2 restart mcu-layout
```

2. Проверьте настройки файрвола (см. раздел "Настройка Firewall")

3. Проверьте настройки nginx (см. раздел "Настройка Nginx для WebRTC")

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи приложения и Nginx
2. Убедитесь, что все переменные окружения настроены правильно
3. Проверьте доступность API сервера и WebSocket сервера
4. Убедитесь, что порты не заблокированы firewall
5. Проверьте настройки WebRTC (см. раздел "Устранение проблем с WebRTC")

