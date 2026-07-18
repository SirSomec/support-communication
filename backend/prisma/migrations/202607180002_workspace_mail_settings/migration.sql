-- Служебная почта воркспейса: SMTP-подключение для сервисных рассылок
-- (2FA, восстановление пароля, приглашения сотрудников). Одна запись на тенант,
-- пароль хранится только шифротекстом (AES-256-GCM), колонки секрета — по схеме
-- ai_connections. Таблица additive и standalone (без FK на tenants).
CREATE TABLE "workspace_mail_settings" (
    "tenant_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "encryption" TEXT NOT NULL DEFAULT 'starttls',
    "username" TEXT,
    "secret_ciphertext" TEXT,
    "secret_iv" TEXT,
    "secret_auth_tag" TEXT,
    "secret_algorithm" TEXT,
    "secret_envelope_version" INTEGER,
    "key_version" TEXT,
    "from_address" TEXT NOT NULL,
    "from_name" TEXT,
    "reply_to" TEXT,
    "timeout_ms" INTEGER NOT NULL DEFAULT 10000,
    "tls_reject_unauthorized" BOOLEAN NOT NULL DEFAULT true,
    "last_tested_at" TIMESTAMPTZ(3),
    "last_test_status" TEXT,
    "last_test_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_mail_settings_pkey" PRIMARY KEY ("tenant_id")
);
