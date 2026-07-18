// Временный альт-гейтвей для ручной браузерной верификации комбобокса тематик.
// Отдельный порт и отдельная смок-БД, чтобы сид не сбросил базу под чужими
// уже запущенными гейтвеями (4100 основной стаб, 4190 csat-стенд) — ловушка
// из playwright-alt-ports-run.
process.env.PLAYWRIGHT_API_PORT ??= "4195";
process.env.SMOKE_DATABASE_NAME ??= "support_communication_smoke_alt2";

await import("./playwright-api-gateway.mjs");
