-- 004_extras.sql
-- Уведомления, сторис, папки, аудит-лог

-- Уведомления
CREATE TABLE notifications (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(32) NOT NULL CHECK (type IN ('message', 'mention', 'reaction', 'call', 'group_invite', 'system')),
  chat_id         BIGINT REFERENCES chats(id) ON DELETE CASCADE,
  from_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_chat ON notifications (chat_id) WHERE chat_id IS NOT NULL;

-- Сторис
CREATE TABLE stories (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(16) NOT NULL CHECK (type IN ('image', 'video')),
  media_url       TEXT NOT NULL,
  text_caption    TEXT,
  views_count     INT NOT NULL DEFAULT 0,
  reactions_count INT NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stories_user_active ON stories (user_id, expires_at DESC);
CREATE INDEX idx_stories_active ON stories (expires_at) WHERE expires_at > NOW();

CREATE TABLE story_views (
  story_id        BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, user_id)
);

-- Папки чатов
CREATE TABLE chat_folders (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(64) NOT NULL,
  emoji           VARCHAR(16),
  color           VARCHAR(16),
  sort_order      INT NOT NULL DEFAULT 0,
  include_archived BOOLEAN NOT NULL DEFAULT FALSE,
  include_muted   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_folders_user ON chat_folders (user_id, sort_order);

-- Аудит-лог для будущей админ-панели
CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  actor_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(64) NOT NULL,
  target_type     VARCHAR(32),
  target_id       TEXT,
  old_value       JSONB,
  new_value       JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_log (actor_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_log (target_type, target_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log (action, created_at DESC);

-- Заблокированные / скрытые пользователи
CREATE TABLE user_blocks (
  blocker_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Жалобы (для админки)
CREATE TABLE reports (
  id              BIGSERIAL PRIMARY KEY,
  reporter_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type     VARCHAR(16) NOT NULL CHECK (target_type IN ('user', 'message', 'chat')),
  target_id       BIGINT NOT NULL,
  reason          TEXT,
  status          VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'rejected', 'actioned')),
  reviewed_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_status ON reports (status, created_at DESC);
CREATE INDEX idx_reports_target ON reports (target_type, target_id);
