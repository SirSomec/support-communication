// Временный альт-гейтвей для ручной браузерной верификации CSAT-флоу.
// Отдельный порт и отдельная смок-БД: сид не должен сбросить базу под чужим
// уже запущенным гейтвеем на 4100 (ловушка из playwright-alt-ports-run).
// Telegram-вебхук включается в legacy-режиме (секрет без подключения), чтобы
// прогонять входящие события curl'ом без реального Bot API.
process.env.PLAYWRIGHT_API_PORT ??= "4190";
process.env.SMOKE_DATABASE_NAME ??= "support_communication_smoke_csat";
process.env.TELEGRAM_INGRESS_MODE ??= "webhook";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "csat-verify-secret";
process.env.TELEGRAM_LEGACY_TENANT_ID ??= "tenant-volga";

await import("./playwright-api-gateway.mjs");
