-- 002_chats.sql
-- Чаты (DM, группы, каналы), участники, денормализованная таблица user_chats

CREATE TABLE chats (
  id              BIGSERIAL PRIMARY KEY,
  type            VARCHAR(16) NOT NULL CHECK (type IN ('dm', 'group', 'channel')),
  title           VARCHAR(128),
  username        VARCHAR(32) UNIQUE,
  description     TEXT,
  avatar_url      TEXT,
  owner_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  is_public       BOOLEAN NOT NULL DEFAULT FALSE,
  members_can_post BOOLEAN NOT NULL DEFAULT TRUE,
  slow_mode_sec   INT NOT NULL DEFAULT 0,
  pinned_message_id BIGINT,
  invite_link     TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chats_type ON chats (type);
CREATE INDEX idx_chats_username ON chats (username) WHERE username IS NOT NULL;
CREATE INDEX idx_chats_owner ON chats (owner_id);
CREATE INDEX idx_chats_public ON chats (is_public, type) WHERE is_public;

-- Участники чата
CREATE TABLE chat_members (
  chat_id         BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(16) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_message_id BIGINT,
  is_muted        BOOLEAN NOT NULL DEFAULT FALSE,
  muted_until     TIMESTAMPTZ,
  PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX idx_chat_members_user ON chat_members (user_id);
CREATE INDEX idx_chat_members_chat ON chat_members (chat_id);

-- Денормализованная таблица для быстрого списка чатов пользователя
-- Обновляется триггерами при добавлении сообщений
CREATE TABLE user_chats (
  user_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id              BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  last_message_id      BIGINT,
  last_message_text    TEXT,
  last_message_from_id BIGINT,
  last_message_type    VARCHAR(16),
  last_message_has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  last_message_at      TIMESTAMPTZ,
  unread_count         INT NOT NULL DEFAULT 0,
  is_pinned            BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived          BOOLEAN NOT NULL DEFAULT FALSE,
  is_muted             BOOLEAN NOT NULL DEFAULT FALSE,
  folder_id            BIGINT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, chat_id)
);

CREATE INDEX idx_user_chats_list ON user_chats (
  user_id,
  is_pinned DESC,
  is_archived,
  last_message_at DESC NULLS LAST,
  chat_id DESC
);

CREATE INDEX idx_user_chats_unread ON user_chats (user_id) WHERE unread_count > 0;
CREATE INDEX idx_user_chats_folder ON user_chats (user_id, folder_id);
