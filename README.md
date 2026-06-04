# QWAS Messenger v2.0

Telegram-like мессенджер на Node.js + PostgreSQL.

## Что нового в v2.0
- **PostgreSQL** вместо MongoDB (скорость, ACID, удобная админка через Adminer)
- **Полностью переписанный backend** с репозиторной архитектурой
- **Frontend без inline `onclick`** — все обработчики через `addEventListener`
- **Чистая инициализация** через `boot.js`
- **Денормализация** списка чатов через триггеры в БД
- **Админ-панель готова к подключению** — таблицы `audit_log`, `reports`, `users` с `is_admin`, `is_banned` уже есть

## Требования
- Node.js 18+ (написан под LTS)
- PostgreSQL 14+ (рекомендуется 16)
- 512 МБ RAM минимум (1 ГБ рекомендуется)
- Linux/Windows/macOS

## Быстрый старт

### 1. Подготовка `.env`
```bash
cp .env.example .env
# Отредактируй .env, укажи PG пароль и JWT_SECRET
```

### 2. Установка зависимостей
```bash
npm install
```

### 3. Создание БД в PostgreSQL
```bash
sudo -u postgres psql
```
```sql
CREATE USER qwas WITH PASSWORD 'YOUR_STRONG_PASSWORD';
CREATE DATABASE qwas OWNER qwas;
GRANT ALL PRIVILEGES ON DATABASE qwas TO qwas;
\q
```

### 4. Запуск миграций
```bash
npm run migrate
```

### 5. Запуск
```bash
# разработка
npm run dev

# продакшн
npm start
# или через PM2
pm2 start ecosystem.config.js
```

## Установка PostgreSQL на чистый VPS (Ubuntu/Debian)

```bash
# Установка
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Включаем и запускаем
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Создаём пользователя и БД
sudo -u postgres psql <<'SQL'
CREATE USER qwas WITH PASSWORD 'STRONG_PASSWORD_HERE';
CREATE DATABASE qwas OWNER qwas;
GRANT ALL PRIVILEGES ON DATABASE qwas TO qwas;
SQL
```

## Деплой на VPS (пошагово)

```bash
# 1. Подключаемся к серверу
ssh user@your-server

# 2. Устанавливаем Node.js 20 (через nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# 3. Ставим PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib nginx certbot python3-certbot-nginx
sudo systemctl enable postgresql
sudo systemctl start postgresql

# 4. Создаём БД
sudo -u postgres psql <<'SQL'
CREATE USER qwas WITH PASSWORD 'CHANGE_ME';
CREATE DATABASE qwas OWNER qwas;
GRANT ALL PRIVILEGES ON DATABASE qwas TO qwas;
SQL

# 5. Клонируем проект
cd /var/www
sudo git clone <your-repo-url> qwas
sudo chown -R $USER:$USER qwas
cd qwas

# 6. Создаём .env
cat > .env <<'EOF'
PORT=3000
NODE_ENV=production
HOST=0.0.0.0

PGHOST=127.0.0.1
PGPORT=5432
PGUSER=qwas
PGPASSWORD=CHANGE_ME
PGDATABASE=qwas
PG_POOL_MAX=20
PG_POOL_MIN=2

JWT_SECRET=PASTE_RANDOM_64_BYTE_HEX_HERE
JWT_TTL=30d
BCRYPT_ROUNDS=10

UPLOAD_DIR=uploads
CHUNK_DIR=uploads/chunks
MAX_FILE_SIZE=52428800
MAX_CHUNK_SIZE=5242880

STORY_TTL_HOURS=24
CORS_ORIGIN=*
EOF

# 7. Генерируем JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Вставляем результат в .env в JWT_SECRET=

# 8. Ставим зависимости
npm ci --omit=dev

# 9. Запускаем миграции
npm run migrate

# 10. Создаём папки для загрузок
mkdir -p uploads/chunks
chmod 755 uploads uploads/chunks

# 11. Ставим PM2
sudo npm install -g pm2

# 12. Запускаем через PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# 13. Настраиваем Nginx
sudo nano /etc/nginx/sites-available/qwas
```
```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 60M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/qwas /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 14. SSL
sudo certbot --nginx -d your-domain.com

# 15. Готово!
curl https://your-domain.com/health
# {"status":"ok","db":"ok",...}
```

## Установка Adminer (админ-панель БД)

```bash
sudo mkdir -p /var/www/adminer
cd /var/www/adminer
sudo wget https://github.com/vrana/adminer/releases/download/v4.8.1/adminer-4.8.1-en.php -O index.php
sudo chown -R www-data:www-data /var/www/adminer

# Добавляем в nginx
sudo nano /etc/nginx/sites-available/qwas
```
```nginx
location /adminer {
    alias /var/www/adminer;
    try_files $uri $uri/ /adminer/index.php?$args;
    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $request_filename;
    }
}
```
- Вход: PostgreSQL, server `127.0.0.1:5432`, user `qwas`, password из `.env`
- Можно руками править таблицы users, chats, messages, audit_log, reports

## Структура БД

| Таблица | Назначение |
|---|---|
| `users` | Пользователи, настройки, presence |
| `chats` | Чаты (DM / group / channel) |
| `chat_members` | Участники чата, роли, mute |
| `user_chats` | **Денормализованная** таблица для быстрого списка чатов (обновляется триггерами) |
| `messages` | Сообщения с `conversationId`, JSONB attachments, FTS-индекс |
| `reactions` | Реакции на сообщения |
| `notifications` | Уведомления |
| `stories` | Сторис с TTL |
| `chat_folders` | Папки чатов |
| `audit_log` | **Для админ-панели** — все действия записываются |
| `reports` | **Для админ-панели** — жалобы |
| `user_blocks` | Блокировки пользователей |

Все таблицы готовы к прямому редактированию через Adminer. Поля `is_admin`, `is_banned`, `ban_reason` уже есть в `users`.

## API Endpoints

### Auth
- `POST /register` — регистрация
- `POST /login` — вход
- `POST /logout` — выход
- `GET /me` — текущий пользователь

### Profile
- `GET /profile` — свой профиль
- `PATCH /profile` — обновить
- `GET /profile/contacts` — контакты
- `POST /profile/contacts/:username` — добавить
- `DELETE /profile/contacts/:username` — удалить
- `POST /profile/dm/:username` — открыть/создать DM

### Chats
- `GET /chats?tab=all|unread|groups|channels` — список
- `GET /chats/:id` — инфо
- `GET /chats/:id/info` — с участниками
- `GET /chats/:id/messages?beforeId=X` — история (cursor)
- `GET /chats/:id/media?type=image` — медиа
- `GET /chats/:id/search?q=` — поиск в чате
- `POST /chats/:id/read` — прочитано
- `POST /chats/:id/pin` — закрепить
- `POST /chats/:id/archive` — архив
- `POST /chats/:id/mute` — мут

### Groups
- `POST /groups` — создать группу/канал
- `GET /groups/:id` — инфо
- `POST /groups/:id/members` — добавить
- `DELETE /groups/:id/members/:username` — удалить

### Upload
- `POST /upload` — простая загрузка (до 2 МБ)
- `POST /upload/chunk/init` — начать чанковую
- `POST /upload/chunk/:id` — загрузить чанк
- `POST /upload/chunk/:id/complete` — завершить
- `DELETE /upload/chunk/:id` — отменить
- `DELETE /upload/file` — удалить загруженный

### Stories
- `GET /stories/feed` — лента
- `POST /stories` — создать
- `POST /stories/:id/view` — просмотрено
- `DELETE /stories/:id` — удалить

### Folders
- `GET /folders` — список
- `POST /folders` — создать
- `PATCH /folders/:id` — обновить
- `DELETE /folders/:id` — удалить

### Search
- `GET /search/users?q=` — пользователи
- `GET /search/messages?q=` — сообщения
- `GET /search/chats?q=` — чаты

### Notifications
- `GET /notifications` — список
- `POST /notifications/read` — прочитать (ids или все)
- `POST /notifications/read-all` — прочитать все

## WebSocket события (Socket.io)

### Клиент → Сервер
- `send_message` — отправить
- `edit_message` — редактировать
- `delete_message` — удалить
- `add_reaction` / `remove_reaction` — реакции
- `mark_as_read` — прочитано
- `typing` / `stop_typing` — набор
- `get_history` — загрузить историю
- `call_user` / `call_answer` / `call_ice_candidate` / `call_end` / `call_reject` — WebRTC

### Сервер → Клиент
- `init` — начальный стейт
- `new_message` — новое сообщение
- `message_edited` / `message_deleted` / `message_read`
- `reaction_added` / `reaction_removed`
- `user:online` / `user:offline`
- `typing` / `stop_typing`
- `incoming_call` / `call_signal` / `call_ice_candidate` / `call_end`

## Где что в коде

| Путь | Что |
|---|---|
| `server.js` | Точка входа, middleware, роуты |
| `db/pg.js` | PostgreSQL pool, утилиты транзакций |
| `db/migrations/*.sql` | SQL-миграции |
| `db/repos/*.js` | Доступ к данным (users, chats, messages...) |
| `routes/*.js` | HTTP API |
| `socket/handlers.js` | WebSocket обработчики |
| `public/js/boot.js` | Точка входа frontend |
| `public/js/app.js` | Инициализация приложения |
| `public/js/emoji.js` | Эмодзи-панель (10 категорий, поиск, recent) |
| `public/js/voice.js` | Запись голоса и видео-кружков |
| `public/js/calls.js` | WebRTC звонки |
| `public/js/messages.js` | Рендер и отправка сообщений |
| `public/js/composer.js` | Композер (текст, вложения, режим записи) |
| `public/js/attach.js` | Загрузка файлов, drag-drop, геолокация, контакт |

## Скрипты
- `npm start` — запуск
- `npm run dev` — nodemon
- `npm run migrate` — применить миграции
- `npm run migrate:status` — статус миграций
- `npm run migrate:reset` — **УДАЛИТ ВСЕ ДАННЫЕ** и пересоздаст схему
- `npm run seed` — тестовые данные (TODO)

## Что починить / доработать в будущем
- Админ-панель (таблицы и API уже готовы, нужен UI)
- E2E шифрование сообщений
- Push-уведомления через Web Push API
- Видео-конвертация на сервере (ffmpeg)
- Глобальный поиск по всем чатам с фильтрами
- Экспорт чата
