-- 005_performance.sql
-- Дополнительные индексы и оптимизации для быстрой загрузки чатов/сообщений

-- Составной индекс для быстрого поиска пары участников в DM
-- (ускоряет findOrCreateDM и subquery для other_user)
CREATE INDEX IF NOT EXISTS idx_chat_members_chat_user
  ON chat_members (chat_id, user_id);

-- Индекс для быстрого получения "другого пользователя" в DM
-- (LIMIT 1, но все равно ускоряет)
CREATE INDEX IF NOT EXISTS idx_chat_members_chat_only
  ON chat_members (chat_id);

-- Покрывающий индекс для getUserChats (включает часто используемые колонки)
-- Позволяет index-only scan для основного запроса
CREATE INDEX IF NOT EXISTS idx_user_chats_covering
  ON user_chats (user_id, is_archived, is_pinned DESC, last_message_at DESC NULLS LAST, chat_id DESC)
  INCLUDE (last_message_id, last_message_text, last_message_from_id, last_message_type, last_message_has_attachments, unread_count, is_muted, folder_id);

-- Индекс для last_message_from_id (ускоряет LATERAL JOIN в getUserChats)
CREATE INDEX IF NOT EXISTS idx_users_id_covering
  ON users (id)
  INCLUDE (username, first_name, last_name, avatar_url, presence, last_seen);

-- VACUUM ANALYZE для обновления статистики после создания индексов
VACUUM ANALYZE user_chats;
VACUUM ANALYZE chat_members;
VACUUM ANALYZE messages;
