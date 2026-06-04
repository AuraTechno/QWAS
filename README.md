# QWAS Messenger

Современный мессенджер в стиле Telegram с веб-интерфейсом, real-time сообщениями через WebSocket, историями, группами, голосовыми и видео-сообщениями.

## Возможности

- **Регистрация и авторизация** — JWT-токены, безопасное хранение паролей (bcrypt)
- **Личные чаты и группы** — текстовые сообщения, медиа, документы, голосовые, видео, опросы, геолокация
- **Реакции** — 8 быстрых эмодзи + полная панель выбора
- **Ответы, пересылки, редактирование, удаление** сообщений
- **Закрепление сообщений и чатов, архивация, mute-уведомления**
- **Папки чатов** с пользовательской настройкой
- **Истории (Stories)** — фото/видео с авто-удалением через 24 часа
- **Звонки** (audio/video) — WebRTC signaling
- **Профили** — аватар, имя/фамилия, био, блокировка пользователей, контакты
- **Темы** — тёмная, светлая, midnight с настраиваемым акцентом
- **Mobile-first** — адаптивная вёрстка, PWA, установка на домашний экран
- **Service Worker** — оффлайн-кэш
- **Real-time** — Socket.io: typing, presence, read receipts, статусы доставки
- **Загрузка файлов** — обычная и чанковая (для больших файлов)
- **Поиск** по пользователям, группам, сообщениям
- **Контекстное меню** — долгое нажатие / правый клик

## Стек

- **Backend:** Node.js, Express, Socket.io, MongoDB (Mongoose), JWT, bcrypt, Multer
- **Frontend:** Vanilla JS (без фреймворков), CSS3, Service Worker, MediaRecorder API
- **Хранение:** MongoDB, локальная FS для uploads

## Структура

```
QWAS/
├── server.js               # Express + Socket.io
├── config.js               # URL Mongo, JWT secret, pagination
├── ecosystem.config.js     # PM2 конфиг
├── package.json
├── .env                    # секреты (не коммитится)
├── models/                 # Mongoose модели
│   ├── User.js
│   ├── Message.js
│   ├── Group.js
│   ├── Notification.js
│   ├── Folder.js
│   └── Story.js
├── routes/                 # Express роуты
│   ├── auth.js
│   ├── profile.js
│   ├── chats.js
│   ├── groups.js
│   ├── upload.js
│   ├── stories.js
│   └── folders.js
├── socket/
│   ├── auth.js             # Socket.io JWT middleware
│   └── handlers.js         # Все события
├── utils/logger.js
└── public/
    ├── index.html
    ├── manifest.json
    ├── sw.js               # Service worker
    ├── icon-192.png / icon-512.png
    ├── css/                # 9 файлов
    └── js/                 # 22 модуля
```

## Установка (локально)

```bash
git clone <repo>
cd QWAS
npm install
```

Создайте `.env`:
```
PORT=3000
MONGO_URL=mongodb://127.0.0.1:27017/messenger
JWT_SECRET=your_random_secret_here_min_32_chars
CORS_ORIGIN=*
```

Запустите MongoDB, затем:
```bash
npm start
# или для разработки
npm run dev
```

Откройте `http://localhost:3000`.

## Деплой на VPS (Ubuntu)

### 1. Подготовка сервера

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git
sudo npm install -g pm2

# MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

### 2. Клонирование и настройка

```bash
cd /var/www
sudo git clone https://github.com/<user>/<repo>.git qwas
cd qwas
sudo npm ci --production

sudo nano .env
# MONGO_URL=mongodb://127.0.0.1:27017/messenger
# JWT_SECRET=<openssl rand -hex 32>
# PORT=3000
# CORS_ORIGIN=https://yourdomain.com

sudo mkdir -p uploads logs
sudo chown -R $USER:$USER /var/www/qwas
```

### 3. Запуск через PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. Nginx reverse proxy + SSL

```bash
sudo nano /etc/nginx/sites-available/qwas
```

```nginx
server {
    listen 80;
    server_name messenger.yourdomain.com;

    client_max_body_size 60M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/qwas /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d messenger.yourdomain.com
```

### 5. Деплой обновлений

```bash
# локально
git add -A
git commit -m "update"
git push origin main

# на VPS
cd /var/www/qwas
git pull
npm ci --production
pm2 restart messenger
```

## Безопасность

- JWT с подписью, токены хранятся в `User.sessionToken` (invalidate on logout)
- Bcrypt для паролей (cost 10)
- Helmet для HTTP-заголовков
- Rate-limit на login/register (200 req / 15 min)
- CORS контролируется переменной окружения
- Блокировка пользователей — проверка на отправку и чтение сообщений
- Максимальный размер аплоада: 50 МБ (один файл), 60 МБ (JSON body)

## Лицензия

MIT
