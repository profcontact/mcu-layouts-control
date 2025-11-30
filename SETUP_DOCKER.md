# Инструкция по развертыванию MCU Layout через Docker

Данная инструкция описывает процесс развертывания приложения MCU Layout в production окружении с использованием Docker и Docker Compose.

## 📋 Требования

- Docker 20.10+ установлен
- Docker Compose 2.0+ установлен
- Минимум 2GB свободной RAM
- Домен или IP адрес для доступа к приложению
- SSL сертификат (для HTTPS, рекомендуется Let's Encrypt)

## 🔧 Установка Docker

### Ubuntu/Debian

```bash
# Обновление пакетов
sudo apt update

# Установка зависимостей
sudo apt install -y ca-certificates curl gnupg lsb-release

# Добавление официального GPG ключа Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Настройка репозитория
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Установка Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Добавление пользователя в группу docker (чтобы не использовать sudo)
sudo usermod -aG docker $USER

# Перезагрузка сессии (или выполните: newgrp docker)
```

### Проверка установки

```bash
docker --version
docker compose version
```

## 📦 Развертывание приложения

### 1. Подготовка проекта

```bash
# Клонируйте репозиторий или скопируйте файлы проекта
cd /var/www
sudo mkdir -p mcu-layout
sudo chown $USER:$USER mcu-layout
cd mcu-layout

# Клонируйте репозиторий
git clone <repository-url> .
```

### 2. Настройка переменных окружения

**Важно:** Docker Compose автоматически загружает переменные из файла `.env` в корне проекта. Также можно использовать `.env.production` через `env_file`.

Создайте файл `.env.production` в корне проекта:

```bash
nano .env.production
```

**Альтернативно:** Создайте файл `.env` в корне проекта (Docker Compose загрузит его автоматически):

```bash
nano .env
```

Добавьте следующие переменные:

```env
# REST API URL
API_URL=https://your-api-domain.com/api/rest

# WebSocket host для server-side (с протоколом)
WS_HOST=wss://your-ws-domain.com

# WebSocket host для клиента (только домен)
NEXT_PUBLIC_WS_HOST=your-ws-domain.com

# TURN сервер настройки (опционально, но рекомендуется)
# Если TURN сервер запущен в Docker, используйте имя сервиса: turn:coturn:3478
# Если TURN сервер на отдельном хосте, используйте: turn:your-turn-server.com:3478
NEXT_PUBLIC_TURN_SERVER=turn:coturn:3478
NEXT_PUBLIC_TURN_USERNAME=turnuser
NEXT_PUBLIC_TURN_PASSWORD=turnpassword

# WebRTC ICE Transport Policy
# "all" - все кандидаты с фильтрацией (по умолчанию)
# "relay" - только relay кандидаты через TURN (рекомендуется, если TURN настроен)
NEXT_PUBLIC_WEBRTC_ICE_POLICY=relay

# TURN сервер настройки для контейнера coturn
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpassword
TURN_REALM=your-domain.com
# Внешний IP адрес сервера (обязательно для работы через NAT)
# Если сервер за NAT, используйте формат: INTERNAL_IP/EXTERNAL_IP
EXTERNAL_IP=YOUR_SERVER_IP

# Node environment
NODE_ENV=production
```

**Важно:** 
- Замените `your-api-domain.com` и `your-ws-domain.com` на ваши реальные домены.
- Замените `YOUR_SERVER_IP` на внешний IP адрес вашего сервера (обязательно для TURN).
- Если сервер находится за NAT, используйте формат: `INTERNAL_IP/EXTERNAL_IP` (например: `192.168.1.100/203.0.113.1`).
- **Для быстрого старта:** Скопируйте `.env.production.example` в `.env.production` и заполните значения:
  ```bash
  cp .env.production.example .env.production
  nano .env.production
  ```
- Docker Compose автоматически загружает переменные из `.env` файла (если он существует в корне проекта).

### 3. Сборка Docker образа

```bash
# Сборка образа
docker compose build

# Или используя docker build напрямую
docker build -t mcu-layout:latest .
```

### 4. Настройка TURN сервера (coturn)

TURN сервер уже включен в `docker-compose.yml` и будет запущен автоматически. 

**Важно:** Убедитесь, что в `.env.production` указан правильный `EXTERNAL_IP`:

```env
EXTERNAL_IP=YOUR_SERVER_IP
```

Если сервер находится за NAT:
```env
EXTERNAL_IP=192.168.1.100/203.0.113.1
```

### 5. Запуск контейнеров

```bash
# Запуск всех сервисов (mcu-layout + coturn) в фоновом режиме
docker compose up -d

# Просмотр логов
docker compose logs -f

# Просмотр логов только приложения
docker compose logs -f mcu-layout

# Просмотр логов только TURN сервера
docker compose logs -f coturn
```

**Проверка работы:**

```bash
# Проверка статуса контейнеров
docker compose ps

# Проверка работы приложения
curl http://localhost:3000

# Проверка работы TURN сервера
docker compose exec coturn turnutils_stunclient localhost
```

### 5. Проверка статуса

```bash
# Проверка статуса контейнера
docker compose ps

# Или
docker ps

# Просмотр логов
docker compose logs -f

# Или
docker logs -f mcu-layout
```

## 🌐 Настройка Nginx (Reverse Proxy)

### 1. Установка Nginx

```bash
sudo apt update
sudo apt install nginx
```

### 2. Создание конфигурации Nginx

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

    # Проксирование к Docker контейнеру
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
        
        # Увеличенные буферы для WebRTC signalling
        client_body_buffer_size 128k;
        client_max_body_size 10M;
        proxy_request_buffering off;
        proxy_buffering off;
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

### 3. Активация конфигурации

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

## 🔥 Настройка Firewall для TURN сервера

TURN сервер требует открытых UDP портов для работы. Настройте файрвол в зависимости от вашей системы.

### Определение активного файрвола

```bash
# Проверка, какой файрвол используется
which firewall-cmd
which iptables
which ufw

# Проверка статуса firewalld (если установлен)
sudo systemctl status firewalld
```

### Для firewalld (CentOS/RHEL/Fedora)

```bash
# Разрешить HTTP и HTTPS
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https

# TURN сервер: Разрешить UDP порты для медиа-трафика
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=3478/tcp
sudo firewall-cmd --permanent --add-port=49152-65535/udp

# Применить изменения
sudo firewall-cmd --reload

# Проверить статус
sudo firewall-cmd --list-all
```

### Для UFW (Ubuntu/Debian)

```bash
# Разрешить HTTP и HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# TURN сервер: Разрешить UDP порты для медиа-трафика
sudo ufw allow 3478/udp
sudo ufw allow 3478/tcp
sudo ufw allow 49152:65535/udp

# Включить файрвол (если еще не включен)
sudo ufw enable

# Проверить статус
sudo ufw status
```

### Для iptables (прямое управление)

```bash
# Разрешить HTTP и HTTPS
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# TURN сервер: Разрешить UDP порты для медиа-трафика
sudo iptables -A INPUT -p udp --dport 3478 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3478 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 49152:65535 -j ACCEPT

# Сохранить правила (для CentOS/RHEL)
sudo service iptables save
# или
sudo /usr/libexec/iptables/iptables.init save

# Проверить правила
sudo iptables -L -n
```

**Важно:** Если Docker использует iptables напрямую, убедитесь, что правила файрвола не конфликтуют с Docker.

## 🔄 Управление контейнером

### Docker Compose команды

```bash
# Запуск контейнера
docker compose up -d

# Остановка контейнера
docker compose stop

# Перезапуск контейнера
docker compose restart

# Остановка и удаление контейнера
docker compose down

# Просмотр логов
docker compose logs -f

# Просмотр логов за последние 100 строк
docker compose logs --tail=100 -f

# Пересборка и перезапуск
docker compose up -d --build

# Выполнение команды в контейнере
docker compose exec mcu-layout sh
```

### Docker команды (без Compose)

```bash
# Запуск контейнера
docker start mcu-layout

# Остановка контейнера
docker stop mcu-layout

# Перезапуск контейнера
docker restart mcu-layout

# Просмотр логов
docker logs -f mcu-layout

# Просмотр логов за последние 100 строк
docker logs --tail=100 -f mcu-layout

# Выполнение команды в контейнере
docker exec -it mcu-layout sh

# Удаление контейнера
docker rm -f mcu-layout

# Пересборка образа
docker build -t mcu-layout:latest .

# Просмотр использования ресурсов
docker stats mcu-layout
```

## 🔄 Обновление приложения

### Способ 1: Docker Compose

```bash
# Остановите контейнер
docker compose down

# Получите последние изменения
git pull origin main

# Пересоберите образ
docker compose build --no-cache

# Запустите контейнер
docker compose up -d
```

### Способ 2: Docker (без Compose)

```bash
# Остановите контейнер
docker stop mcu-layout
docker rm mcu-layout

# Получите последние изменения
git pull origin main

# Пересоберите образ
docker build -t mcu-layout:latest .

# Запустите новый контейнер
docker run -d \
  --name mcu-layout \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env.production \
  mcu-layout:latest
```

## 📊 Мониторинг

### Просмотр логов

```bash
# Docker Compose
docker compose logs -f mcu-layout

# Docker
docker logs -f mcu-layout

# Логи с фильтрацией
docker logs mcu-layout 2>&1 | grep ERROR
```

### Мониторинг ресурсов

```bash
# Использование ресурсов контейнера
docker stats mcu-layout

# Информация о контейнере
docker inspect mcu-layout

# Процессы в контейнере
docker top mcu-layout
```

### Health Check

Контейнер имеет встроенный health check. Проверьте статус:

```bash
docker inspect --format='{{.State.Health.Status}}' mcu-layout
```

## 🔧 Оптимизация

### 1. Multi-stage build

Dockerfile использует multi-stage build для минимизации размера образа:
- **deps** - установка зависимостей
- **builder** - сборка приложения
- **runner** - финальный образ с минимальным размером

### 2. Ограничения ресурсов

В `docker-compose.yml` настроены ограничения ресурсов:
- Максимум: 2 CPU, 2GB RAM
- Минимум: 0.5 CPU, 512MB RAM

### 3. Кэширование слоев

Docker автоматически кэширует слои при сборке. Для полной пересборки:

```bash
docker compose build --no-cache
```

## 🐛 Решение проблем

### Проблемы с WebRTC и TURN сервером

#### Ошибка: "Failed to read connection-address and port from the candidate attribute"

Эта ошибка возникает, когда сервер получает ICE candidates с локальными адресами (например, `.local` домены).

**Решение:**

1. **Убедитесь, что TURN сервер запущен:**
   ```bash
   docker compose ps
   docker compose logs coturn
   ```

2. **Проверьте настройки TURN в `.env.production`:**
   ```env
   NEXT_PUBLIC_TURN_SERVER=turn:coturn:3478
   NEXT_PUBLIC_TURN_USERNAME=turnuser
   NEXT_PUBLIC_TURN_PASSWORD=turnpassword
   NEXT_PUBLIC_WEBRTC_ICE_POLICY=relay
   EXTERNAL_IP=YOUR_SERVER_IP
   ```

3. **Убедитесь, что EXTERNAL_IP указан правильно:**
   - Если сервер имеет публичный IP: `EXTERNAL_IP=203.0.113.1`
   - Если сервер за NAT: `EXTERNAL_IP=192.168.1.100/203.0.113.1`

4. **Проверьте, что порты TURN открыты в файрволе:**
   ```bash
   # Для firewalld
   sudo firewall-cmd --list-all | grep 3478
   
   # Для UFW
   sudo ufw status | grep 3478
   ```

5. **Перезапустите контейнеры:**
   ```bash
   docker compose restart
   ```

#### TURN сервер не запускается

**Проверьте логи:**
```bash
docker compose logs coturn
```

**Частые проблемы:**

1. **Порт 3478 уже занят:**
   ```bash
   # Проверьте, что порт свободен
   sudo netstat -tulpn | grep 3478
   
   # Если занят, остановите конфликтующий сервис или измените порт в docker-compose.yml
   ```

2. **Неправильный EXTERNAL_IP:**
   - Убедитесь, что `EXTERNAL_IP` указан в `.env.production`
   - Для сервера за NAT используйте формат `INTERNAL_IP/EXTERNAL_IP`

3. **Проблемы с правами доступа к файлу конфигурации:**
   ```bash
   # Убедитесь, что файл coturn.conf существует и доступен
   ls -la coturn.conf
   ```

#### Видео не воспроизводится

1. **Проверьте логи приложения:**
   ```bash
   docker compose logs -f mcu-layout | grep VideoStream
   ```

2. **Проверьте, что TURN сервер используется:**
   - В логах должно быть: `TURN server configured: turn:coturn:3478`
   - В логах должно быть: `Using iceTransportPolicy: relay`

3. **Проверьте настройки браузера:**
   - Убедитесь, что браузер не блокирует WebRTC
   - Проверьте консоль браузера на наличие ошибок

4. **Проверьте сетевую связность:**
   ```bash
   # Из контейнера приложения проверьте доступность TURN
   docker compose exec mcu-layout wget -O- http://coturn:3478
   ```

### Контейнер не запускается

1. Проверьте логи:
```bash
docker logs mcu-layout
```

2. Проверьте переменные окружения:
```bash
docker exec mcu-layout env
```

3. Проверьте, что порт 3000 свободен:
```bash
netstat -tulpn | grep 3000
```

### Ошибка при сборке

1. Очистите Docker кэш:
```bash
docker system prune -a
```

2. Пересоберите без кэша:
```bash
docker compose build --no-cache
```

### Проблемы с памятью

1. Увеличьте лимиты в `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      memory: 4G
```

2. Или запустите с большим лимитом:
```bash
docker run -d --memory="4g" --name mcu-layout ...
```

### Nginx возвращает 502 Bad Gateway

1. Проверьте, что контейнер запущен:
```bash
docker ps | grep mcu-layout
```

2. Проверьте логи контейнера:
```bash
docker logs mcu-layout
```

3. Проверьте доступность приложения:
```bash
curl http://localhost:3000
```

## 🔐 Безопасность

### Рекомендации:

1. **Не храните секреты в образе** - используйте переменные окружения или Docker secrets
2. **Обновляйте базовый образ** - регулярно обновляйте `node:23.10.0-alpine`
3. **Используйте непривилегированного пользователя** - образ уже настроен с пользователем `nextjs`
4. **Ограничьте ресурсы** - используйте limits в docker-compose.yml
5. **Сканируйте образы** - используйте `docker scan` для проверки уязвимостей

### Сканирование образа на уязвимости

```bash
docker scan mcu-layout:latest
```

## 📝 Production чек-лист

- [ ] Docker и Docker Compose установлены
- [ ] Файл `.env.production` создан и настроен
- [ ] Docker образ успешно собран
- [ ] Контейнер запущен и работает
- [ ] Nginx настроен как reverse proxy
- [ ] SSL сертификат получен и настроен
- [ ] Приложение доступно по HTTPS
- [ ] Health check работает
- [ ] Логи настроены и проверены
- [ ] Автозапуск контейнера настроен (`restart: unless-stopped`)
- [ ] Мониторинг настроен

## 🚀 Альтернативные варианты деплоя

### Docker Swarm

```bash
# Инициализация Swarm
docker swarm init

# Деплой стека
docker stack deploy -c docker-compose.yml mcu-layout
```

### Kubernetes

Для деплоя в Kubernetes потребуется создание дополнительных манифестов:
- Deployment
- Service
- ConfigMap для переменных окружения
- Ingress для маршрутизации

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи контейнера: `docker logs mcu-layout`
2. Проверьте логи Nginx: `sudo tail -f /var/log/nginx/mcu-layout-error.log`
3. Убедитесь, что все переменные окружения настроены правильно
4. Проверьте доступность API сервера и WebSocket сервера
5. Убедитесь, что порты не заблокированы firewall

