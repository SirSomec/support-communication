-- Служебная почта переезжает с уровня воркспейса на уровень всего сервиса:
-- единое SMTP-подключение платформы, настраивается только администратором
-- сервиса (ревизия требований от 2026-07-18). Таблица workspace_mail_settings
-- прожила одну итерацию и удаляется вместе с данными: продовых данных нет,
-- per-tenant конфигурация признана ошибочной.
CREATE TABLE "service_mail_settings" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "service_mail_settings_pkey" PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "workspace_mail_settings";
