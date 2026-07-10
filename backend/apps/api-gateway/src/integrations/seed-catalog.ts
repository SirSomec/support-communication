import type { ApiEnvironmentKey, ChannelDetail, SecuritySession, WebhookDelivery } from "./integration.types.js";

export const channelDetails: ChannelDetail[] = [
  {
    id: "sdk",
    name: "SDK Web / Mobile",
    channel: "SDK",
    status: "Активен",
    detail: "2 приложения, 14 680 сессий сегодня",
    health: 98,
    rawId: "chn_sdk_prod_01",
    lastSync: "Сегодня, 12:14",
    route: "Очередь SDK -> 1-я линия",
    limit: "12 чатов на оператора",
    groups: ["Мобильное приложение", "Web widget"],
    connections: [
      { id: "sdk-web-prod", name: "Web widget production", env: "prod", status: "OK", lastEvent: "12:13", traffic: "8 420 событий", rawId: "conn_sdk_web_prod" },
      { id: "sdk-ios-prod", name: "iOS / Android SDK", env: "prod", status: "OK", lastEvent: "12:12", traffic: "6 260 событий", rawId: "conn_sdk_mobile_prod" },
      { id: "sdk-stage", name: "Stage sandbox", env: "stage", status: "Warn", lastEvent: "11:58", traffic: "47 событий", rawId: "conn_sdk_stage" }
    ]
  },
  {
    id: "telegram",
    name: "Telegram Bot",
    channel: "Telegram",
    status: "Активен",
    detail: "Webhook 200 OK, 28% новых обращений",
    health: 94,
    rawId: "chn_tg_support_bot",
    lastSync: "Сегодня, 12:09",
    route: "Telegram -> Очередь мессенджеров",
    limit: "8 чатов на оператора",
    groups: ["Telegram Bot", "VIP bot"],
    connections: [
      { id: "tg-main", name: "Support main bot", env: "prod", status: "OK", lastEvent: "12:09", traffic: "3 940 сообщений", rawId: "conn_tg_main_bot" },
      { id: "tg-vip", name: "VIP bot", env: "prod", status: "OK", lastEvent: "12:03", traffic: "620 сообщений", rawId: "conn_tg_vip_bot" }
    ]
  },
  {
    id: "vk",
    name: "VK Сообщества",
    channel: "VK",
    status: "Требует внимания",
    detail: "SLA 68%, очередь перегружена",
    health: 68,
    rawId: "chn_vk_community_main",
    lastSync: "Сегодня, 12:01",
    route: "VK -> Rescue queue",
    limit: "8 чатов на оператора",
    groups: ["Основное сообщество", "Отдельный проект"],
    connections: [
      { id: "vk-main", name: "Основное сообщество", env: "prod", status: "Warn", lastEvent: "12:01", traffic: "2 480 сообщений", rawId: "conn_vk_main" },
      { id: "vk-project", name: "Проектная группа", env: "prod", status: "OK", lastEvent: "11:59", traffic: "760 сообщений", rawId: "conn_vk_project" },
      { id: "vk-test", name: "Тестовое сообщество", env: "stage", status: "OK", lastEvent: "11:35", traffic: "34 сообщения", rawId: "conn_vk_stage" }
    ]
  }
];

export const apiEnvironmentKeys: ApiEnvironmentKey[] = [
  {
    id: "prod-key",
    env: "production",
    name: "Production SDK key",
    keyPreview: "sk_live_****_8Q2M",
    status: "Protected",
    scopes: ["identifyUser", "initConversation", "webhook:send"],
    lastRotated: "2026-06-10",
    owner: "Администратор",
    protection: "2FA + IP allowlist"
  },
  {
    id: "stage-key",
    env: "stage",
    name: "Stage sandbox key",
    keyPreview: "sk_test_****_44ST",
    status: "Active",
    scopes: ["identifyUser", "trackEntryPoint", "syncTopic"],
    lastRotated: "2026-06-22",
    owner: "QA команда",
    protection: "2FA"
  }
];

export const webhookEndpoints = [
  {
    id: "vk-inbound",
    name: "VK inbound signed webhook",
    channel: "VK",
    url: "https://api.support.local/webhooks/vk",
    status: "Signature warning",
    signature: "HMAC SHA-256",
    retries: "3 попытки / 30 сек",
    lastDelivery: "12:10",
    failureRate: "2.4%"
  },
  {
    id: "telegram-main",
    name: "Telegram bot delivery",
    channel: "Telegram",
    url: "https://api.support.local/webhooks/tg",
    status: "OK",
    signature: "Bot token + secret",
    retries: "5 попыток / backoff",
    lastDelivery: "12:14",
    failureRate: "0.3%"
  },
  {
    id: "sdk-events",
    name: "SDK event stream",
    channel: "SDK",
    url: "https://api.support.local/webhooks/sdk-events",
    status: "OK",
    signature: "HMAC SHA-256",
    retries: "4 попытки / 60 сек",
    lastDelivery: "12:15",
    failureRate: "0.1%"
  }
];

export const webhookDeliveryLog: WebhookDelivery[] = [
  { id: "dlv-441", endpointId: "vk-inbound", time: "12:10", event: "message_new", status: "signature_failed", attempts: 1, httpStatus: "401", traceId: "hook_vk_441" },
  { id: "dlv-438", endpointId: "telegram-main", time: "12:08", event: "message", status: "delivered", attempts: 1, httpStatus: "200", traceId: "hook_tg_438" },
  { id: "dlv-432", endpointId: "sdk-events", time: "12:04", event: "identifyUser", status: "delivered", attempts: 1, httpStatus: "202", traceId: "hook_sdk_432" },
  { id: "dlv-429", endpointId: "vk-inbound", time: "11:58", event: "photo_upload", status: "retry_scheduled", attempts: 2, httpStatus: "504", traceId: "hook_vk_429" }
];

export const apiChangelog = [
  { version: "2026-06-26.1", title: "Webhook replay audit id", detail: "Manual replay пишет immutable event id." },
  { version: "2026-06-20.2", title: "SDK initConversation consent", detail: "Добавлена проверка consent/legal для исходящих диалогов." },
  { version: "2026-06-12.4", title: "Signature rotation", detail: "Поддержана ротация HMAC ключей без остановки webhook." }
];

export const securityControls = [
  { id: "mfa", title: "2FA для администраторов", state: "Включено", detail: "3 из 3 администраторов подключили TOTP", tone: "ok" },
  { id: "sessions", title: "Активные сессии", state: "7 сессий", detail: "1 сессия требует перепроверки IP", tone: "warn" },
  { id: "api-protection", title: "API-key protection", state: "Protected", detail: "Ключи показываются только после 2FA и пишутся в audit", tone: "ok" }
];

export const activeSecuritySessions: SecuritySession[] = [
  { id: "sess-ivan", user: "Иван П.", role: "Сотрудник", device: "Chrome / Windows", ip: "10.12.9.44", lastSeen: "12:15", status: "OK" },
  { id: "sess-anna", user: "Анна Р.", role: "Администратор", device: "Safari / macOS", ip: "10.12.4.18", lastSeen: "12:18", status: "2FA OK" },
  { id: "sess-risk", user: "Сервисный ключ", role: "API", device: "CI runner", ip: "185.17.32.90", lastSeen: "12:10", status: "Требует проверки" }
];

export const securityAlerts = [
  { id: "sec-91", time: "12:10", level: "critical", text: "VK inbound webhook: signature mismatch", route: "Audit -> evt_hook_9006" },
  { id: "sec-88", time: "11:44", level: "warn", text: "Новая сессия администратора из нестандартной сети", route: "Security -> sess-anna" }
];
