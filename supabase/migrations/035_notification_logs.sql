-- 알림톡/채널 포스트 발송 이력
CREATE TABLE IF NOT EXISTS notification_logs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  type        text        NOT NULL CHECK (type IN ('alimtalk', 'channel_post', 'sms')),
  recipient   text,
  template_id text,
  variables   jsonb,
  status      text        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  response    jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_logs_type_created_idx
  ON notification_logs (type, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_logs_created_idx
  ON notification_logs (created_at DESC);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
