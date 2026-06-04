-- 005_performance.sql
-- Дополнительные индексы для быстрой загрузки чатов/сообщений
-- VACUUM не используется (запрещён внутри транзакции миграций);
-- ANALYZE выполняется автоматически после CREATE INDEX.

-- Индекс для быстрого получения "другого пользователя" в DM
CREATE INDEX IF NOT EXISTS idx_chat_members_chat_only
  ON chat_members (chat_id);

-- Покрывающий индекс для getUserChats (INCLUDE → index-only scan)
CREATE INDEX IF NOT EXISTS idx_user_chats_covering
  ON user_chats (user_id, is_archived, is_pinned DESC, last_message_at DESC NULLS LAST, chat_id DESC)
  INCLUDE (last_message_id, last_message_text, last_message_from_id, last_message_type, last_message_has_attachments, unread_count, is_muted, folder_id);

-- Покрывающий индекс для users (ускоряет LATERAL JOIN в getUserChats)
CREATE INDEX IF NOT EXISTS idx_users_id_covering
  ON users (id)
  INCLUDE (username, first_name, last_name, avatar_url, presence, last_seen);

-- Принудительный ANALYZE для обновления статистики (безопасен в транзакции)
ANALYZE user_chats;
ANALYZE chat_members;
ANALYZE messages;
