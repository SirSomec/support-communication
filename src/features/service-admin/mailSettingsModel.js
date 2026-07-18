// Модель формы «Служебная почта» админ-панели сервиса: нормализация значений,
// валидация и сборка payload для PUT /service-admin/mail-settings. Пароль в
// форме всегда пустой — сервер отдаёт только признак passwordConfigured.

export const mailEncryptionOptions = [
  { value: "starttls", label: "STARTTLS (обычно порт 587)" },
  { value: "ssl", label: "SSL/TLS (обычно порт 465)" },
  { value: "none", label: "Без шифрования" }
];

export const emptyMailSettingsForm = {
  enabled: false,
  encryption: "starttls",
  fromAddress: "",
  fromName: "",
  host: "",
  password: "",
  port: "587",
  replyTo: "",
  username: ""
};

export function hasEmailShape(value) {
  return /^\S+@\S+\.\S+$/.test(String(value ?? "").trim());
}

export function mailSettingsFormFromResponse(settings) {
  if (!settings) {
    return { ...emptyMailSettingsForm };
  }

  return {
    enabled: Boolean(settings.enabled),
    encryption: ["none", "ssl", "starttls"].includes(settings.encryption) ? settings.encryption : "starttls",
    fromAddress: String(settings.fromAddress ?? ""),
    fromName: String(settings.fromName ?? ""),
    host: String(settings.host ?? ""),
    password: "",
    port: String(settings.port ?? "587"),
    replyTo: String(settings.replyTo ?? ""),
    username: String(settings.username ?? "")
  };
}

export function validateMailSettingsForm(form, { passwordConfigured = false } = {}) {
  const host = String(form.host ?? "").trim();
  if (!host) {
    return "Укажите адрес SMTP-сервера.";
  }
  if (!/^[A-Za-z0-9:.-]+$/.test(host)) {
    return "SMTP-хост может содержать только буквы, цифры, точки и дефисы.";
  }

  const port = Number(String(form.port ?? "").trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "Порт должен быть целым числом от 1 до 65535.";
  }

  if (!hasEmailShape(form.fromAddress)) {
    return "Укажите корректный адрес отправителя.";
  }

  const replyTo = String(form.replyTo ?? "").trim();
  if (replyTo && !hasEmailShape(replyTo)) {
    return "Reply-To должен быть корректным email или пустым.";
  }

  const username = String(form.username ?? "").trim();
  const password = String(form.password ?? "");
  if (username && !password && !passwordConfigured) {
    return "Для логина SMTP укажите пароль.";
  }
  if (!username && password) {
    return "Пароль без логина не используется — укажите логин SMTP.";
  }

  return "";
}

export function buildMailSettingsPayload(form) {
  const username = String(form.username ?? "").trim();
  const password = String(form.password ?? "");
  const payload = {
    enabled: Boolean(form.enabled),
    encryption: form.encryption,
    fromAddress: String(form.fromAddress ?? "").trim(),
    fromName: String(form.fromName ?? "").trim() || null,
    host: String(form.host ?? "").trim(),
    port: Number(String(form.port ?? "").trim()),
    replyTo: String(form.replyTo ?? "").trim() || null,
    username: username || null
  };

  // Пустой пароль в форме означает «не менять сохранённый»; поле уходит на
  // сервер только при вводе нового значения. Очистка логина удаляет пароль
  // на сервере автоматически.
  if (password) {
    payload.password = password;
  }

  return payload;
}

export function describeMailTestState(settings) {
  if (!settings || !settings.lastTestedAt) {
    return "Проверка ещё не выполнялась.";
  }

  const testedAt = formatMailTimestamp(settings.lastTestedAt);
  if (settings.lastTestStatus === "passed") {
    return `Последняя проверка успешна: ${testedAt}.`;
  }
  if (settings.lastTestStatus === "failed") {
    const reason = settings.lastTestMessage ? ` (${settings.lastTestMessage})` : "";
    return `Последняя проверка не прошла${reason}: ${testedAt}.`;
  }
  return `Последняя проверка: ${testedAt}.`;
}

/** Человеческая расшифровка диагноза тестовой отправки с подсказкой, что чинить. */
export function describeMailTestDiagnostic(code) {
  switch (code) {
    case "smtp_timeout":
      return "Сервер не ответил за отведённое время. Чаще всего это неверный порт: для SSL/TLS обычно 465, для STARTTLS — 587.";
    case "smtp_connection_refused":
      return "Соединение отклонено — на этом порту никто не слушает. Проверьте порт: SSL/TLS — 465, STARTTLS — 587.";
    case "smtp_host_not_found":
      return "Хост не найден. Проверьте адрес SMTP-сервера.";
    case "smtp_network_unreachable":
      return "Сервер недоступен по сети. Проверьте адрес и доступ в интернет с сервера платформы.";
    case "smtp_auth_failed":
      return "Сервер отклонил логин или пароль. Для Яндекса, Mail.ru и Google обычно нужен отдельный «пароль приложения», а не пароль аккаунта.";
    case "smtp_sender_rejected":
      return "Сервер отклонил адрес отправителя — обычно он должен совпадать с ящиком, под которым выполняется вход.";
    case "smtp_recipient_rejected":
      return "Сервер отклонил адрес получателя тестового письма.";
    case "smtp_tls_certificate_invalid":
      return "Сертификат сервера не прошёл проверку. Проверьте хост; отключать проверку сертификата стоит только для доверенного внутреннего сервера.";
    case "smtp_tls_failed":
      return "Не удалось установить защищённое соединение. Проверьте соответствие шифрования и порта: SSL/TLS — 465, STARTTLS — 587.";
    case "smtp_connection_closed":
      return "Сервер разорвал соединение. Частая причина — обычное подключение к SSL-порту: проверьте режим шифрования.";
    case "smtp_unexpected_response":
      return "Сервер ответил неожиданным кодом. Проверьте режим шифрования и порт.";
    case "secret_storage_unavailable":
      return "Хранилище секретов недоступно: на сервере не задан мастер-ключ шифрования паролей.";
    case "smtp_unavailable":
      return "Не удалось связаться с SMTP-сервером. Проверьте хост, порт и режим шифрования.";
    default:
      return code ? `Код ошибки: ${code}.` : "";
  }
}

const STANDARD_MAIL_PORTS = new Set(["", "25", "465", "587", "1025", "2525"]);

/**
 * Смена шифрования подставляет стандартный порт (SSL — 465, STARTTLS — 587),
 * если текущий порт стандартный или пустой; нестандартный порт не трогаем.
 */
export function applyEncryptionChange(form, encryption) {
  const next = { ...form, encryption };
  const currentPort = String(form.port ?? "").trim();
  const suggested = encryption === "ssl" ? "465" : encryption === "starttls" ? "587" : "";
  if (suggested && suggested !== currentPort && STANDARD_MAIL_PORTS.has(currentPort)) {
    next.port = suggested;
  }
  return next;
}

export function describeMailDeliverySource(settings, environmentFallback) {
  if (settings?.enabled) {
    return { key: "workspace", label: "рассылки идут через это подключение" };
  }
  if (environmentFallback?.configured) {
    return { key: "environment", label: "используется конфигурация платформы (env)" };
  }
  return { key: "none", label: "доставка писем не настроена" };
}

function formatMailTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
