-- 001_init.sql
-- Базовая схема: пользователи, сессии, контакты, расширения

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;

-- Пользователи
CREATE TABLE users (
  id              BIGSERIAL PRIMARY KEY,
  username        VARCHAR(32) UNIQUE NOT NULL CHECK (username ~ '^[a-z0-9_]{3,32}$'),
  first_name      VARCHAR(64) NOT NULL,
  last_name       VARCHAR(64),
  password_hash   TEXT NOT NULL,
  avatar_url      TEXT,
  bio             TEXT,
  presence        VARCHAR(16) NOT NULL DEFAULT 'offline',
  last_seen       TIMESTAMPTZ,
  settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  is_banned       BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_first_name_trgm ON users USING gin (first_name gin_trgm_ops);
CREATE INDEX idx_users_last_name_trgm ON users USING gin (last_name gin_trgm_ops);
CREATE INDEX idx_users_username_trgm ON users USING gin (username gin_trgm_ops);
CREATE INDEX idx_users_presence ON users (presence, last_seen DESC);
CREATE INDEX idx_users_created ON users (created_at DESC);

-- Сессии / refresh-токены
CREATE TABLE sessions (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,
  device_info     TEXT,
  ip_address      INET,
  user_agent      TEXT,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_token ON sessions (token_hash);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- Контакты
CREATE TABLE contacts (
  owner_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name    VARCHAR(128),
  is_favorite     BOOLEAN NOT NULL DEFAULT FALSE,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, contact_id)
);

CREATE INDEX idx_contacts_owner ON contacts (owner_id);
CREATE INDEX idx_contacts_favorite ON contacts (owner_id, is_favorite) WHERE is_favorite;
