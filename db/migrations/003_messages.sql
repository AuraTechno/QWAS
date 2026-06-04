-- 003_messages.sql
-- Сообщения, реакции, триггеры для обновления user_chats.last_message_*

CREATE TABLE messages (
  id              BIGSERIAL PRIMARY KEY,
  chat_id         BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  from_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text            TEXT,
  type            VARCHAR(16) NOT NULL DEFAULT 'text'
                  CHECK (type IN ('text', 'image', 'video', 'voice', 'file', 'round', 'location', 'contact', 'poll', 'system', 'service')),
  attachments     JSONB NOT NULL DEFAULT '[]'::jsonb,
  reply_to_id     BIGINT REFERENCES messages(id) ON DELETE SET NULL,
  reply_snapshot  JSONB,
  mentions        BIGINT[] NOT NULL DEFAULT '{}'::bigint[],
  forwarded_from_id      BIGINT,
  forwarded_from_chat_id BIGINT,
  forwarded_from_name    TEXT,
  poll_data       JSONB,
  location_data   JSONB,
  contact_data    JSONB,
  is_edited       BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at       TIMESTAMPTZ,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  views_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Главный индекс: выдача истории чата (cursor pagination)
CREATE INDEX idx_messages_chat_created ON messages (chat_id, created_at DESC, id DESC);

-- Поиск упоминаний
CREATE INDEX idx_messages_mentions ON messages USING gin (mentions);

-- Полнотекстовый поиск по тексту (русский)
CREATE INDEX idx_messages_text_trgm ON messages USING gin (text gin_trgm_ops) WHERE text IS NOT NULL AND NOT is_deleted;

-- Сообщения от пользователя (для профиля)
CREATE INDEX idx_messages_from ON messages (from_id, created_at DESC);

-- Медиа-вложения чата (по типу)
CREATE INDEX idx_messages_chat_type ON messages (chat_id, created_at DESC) WHERE type IN ('image', 'video', 'file', 'voice', 'round');

-- Реакции
CREATE TABLE reactions (
  message_id      BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji           VARCHAR(16) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX idx_reactions_message ON reactions (message_id);
CREATE INDEX idx_reactions_user ON reactions (user_id);

-- === Триггеры для денормализации last_message_* в user_chats ===

CREATE OR REPLACE FUNCTION update_user_chats_on_new_message()
RETURNS TRIGGER AS $$
DECLARE
  v_member RECORD;
  v_has_atts BOOLEAN;
  v_chat_type VARCHAR(16);
  v_from_username VARCHAR(32);
BEGIN
  v_has_atts := (NEW.attachments IS NOT NULL AND jsonb_array_length(NEW.attachments) > 0);
  SELECT type INTO v_chat_type FROM chats WHERE id = NEW.chat_id;
  SELECT username INTO v_from_username FROM users WHERE id = NEW.from_id;

  -- Обновляем user_chats для всех участников чата
  FOR v_member IN SELECT user_id FROM chat_members WHERE chat_id = NEW.chat_id LOOP
    INSERT INTO user_chats (
      user_id, chat_id,
      last_message_id, last_message_text, last_message_from_id,
      last_message_type, last_message_has_attachments, last_message_at,
      unread_count, updated_at
    ) VALUES (
      v_member.user_id, NEW.chat_id,
      NEW.id, LEFT(COALESCE(NEW.text, ''), 200), NEW.from_id,
      NEW.type, v_has_atts, NEW.created_at,
      CASE WHEN v_member.user_id = NEW.from_id THEN 0 ELSE 1 END,
      NOW()
    )
    ON CONFLICT (user_id, chat_id) DO UPDATE SET
      last_message_id = EXCLUDED.last_message_id,
      last_message_text = EXCLUDED.last_message_text,
      last_message_from_id = EXCLUDED.last_message_from_id,
      last_message_type = EXCLUDED.last_message_type,
      last_message_has_attachments = EXCLUDED.last_message_has_attachments,
      last_message_at = EXCLUDED.last_message_at,
      unread_count = CASE
        WHEN user_chats.last_message_at IS NULL THEN user_chats.unread_count
        WHEN v_member.user_id = NEW.from_id THEN user_chats.unread_count
        ELSE user_chats.unread_count + 1
      END,
      updated_at = NOW();
  END LOOP;

  -- Обновляем updated_at чата
  UPDATE chats SET updated_at = NOW() WHERE id = NEW.chat_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_message_insert
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_user_chats_on_new_message();

-- Триггер на удаление сообщения (is_deleted = true)
CREATE OR REPLACE FUNCTION update_user_chats_on_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_prev RECORD;
BEGIN
  -- Берём предыдущее сообщение в чате
  SELECT id, text, from_id, type, attachments, created_at
  INTO v_prev
  FROM messages
  WHERE chat_id = OLD.chat_id AND id != OLD.id AND NOT is_deleted
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_prev.id IS NOT NULL THEN
    UPDATE user_chats SET
      last_message_id = v_prev.id,
      last_message_text = LEFT(COALESCE(v_prev.text, ''), 200),
      last_message_from_id = v_prev.from_id,
      last_message_type = v_prev.type,
      last_message_has_attachments = (v_prev.attachments IS NOT NULL AND jsonb_array_length(v_prev.attachments) > 0),
      last_message_at = v_prev.created_at
    WHERE chat_id = OLD.chat_id;
  ELSE
    UPDATE user_chats SET
      last_message_id = NULL,
      last_message_text = NULL,
      last_message_from_id = NULL,
      last_message_type = NULL,
      last_message_has_attachments = FALSE,
      last_message_at = NULL
    WHERE chat_id = OLD.chat_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_message_soft_delete
  AFTER UPDATE OF is_deleted ON messages
  FOR EACH ROW
  WHEN (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted AND NEW.is_deleted = TRUE)
  EXECUTE FUNCTION update_user_chats_on_delete();
