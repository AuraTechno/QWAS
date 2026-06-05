-- 006_email_channels.sql
-- Email + email verification, channel system, settings fields

-- === Email для пользователей ===
ALTER TABLE users ADD COLUMN IF NOT EXISTS email CITEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Уникальный email (не-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (email) WHERE email IS NOT NULL;
-- Поиск по email
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email)) WHERE email IS NOT NULL;

-- === Каналы (Channel) ===
-- Канал — это публичный/приватный чат, у которого есть username и подписчики
ALTER TABLE chats ADD COLUMN IF NOT EXISTS username VARCHAR(64);
ALTER TABLE chats ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_channel BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS subscriber_count INT NOT NULL DEFAULT 0;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- Username канала уникален в рамках каналов
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_username_unique ON chats (lower(username)) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chats_is_channel ON chats (is_channel) WHERE is_channel;
CREATE INDEX IF NOT EXISTS idx_chats_is_public ON chats (is_public) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_chats_owner ON chats (owner_id);

-- === Роли в канале/чате ===
CREATE TABLE IF NOT EXISTS chat_admins (
  chat_id         BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(16) NOT NULL DEFAULT 'admin', -- owner, admin, moderator
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_admins_user ON chat_admins (user_id);

-- === Подписчики канала ===
CREATE TABLE IF NOT EXISTS channel_subscribers (
  channel_id      BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_muted        BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_subs_user ON channel_subscribers (user_id);
CREATE INDEX IF NOT EXISTS idx_channel_subs_channel ON channel_subscribers (channel_id, joined_at DESC);

-- === Device name для sessions (для удобного отображения в "Активные сессии") ===
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_name VARCHAR(128);

-- === Поля профиля (расширение) ===
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(8) NOT NULL DEFAULT 'ru';

-- === 2FA (заготовка) ===
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[];

-- === Pin-код (для веб-версии вместо Face ID) ===
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- === Performance: email lookup ===
ANALYZE users;
ANALYZE chats;
