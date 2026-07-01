export type RedactionLabel = "api_key" | "object_key" | "provider_token" | "secret" | "webhook_signature";

export function redactSensitiveValue<TValue>(value: TValue, key = ""): TValue {
  const label = sensitiveRedactionLabel(key);
  if (label) {
    return `[REDACTED:${label}]` as TValue;
  }

  if (typeof value === "string") {
    return redactSensitiveText(value) as TValue;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item)) as TValue;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactSensitiveValue(entryValue, entryKey)])
    ) as TValue;
  }

  return value;
}

export function sensitiveRedactionLabel(key: string): RedactionLabel | null {
  if (/authorization|api[_-]?key/i.test(key)) {
    return "api_key";
  }

  if (/^object[_-]?key$/i.test(key)) {
    return "object_key";
  }

  if (/signature/i.test(key)) {
    return "webhook_signature";
  }

  if (/token|bot[_-]?token/i.test(key)) {
    return "provider_token";
  }

  if (/secret|password|credential/i.test(key)) {
    return "secret";
  }

  return null;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/Bearer\s+[^"',.}\]\s]+/gi, "Bearer [REDACTED:api_key]")
    .replace(/\b(Public API key\s+)[^"',.}\]\s]+/gi, "$1[REDACTED:api_key]")
    .replace(/\b(key\s+)[^"',.}\]\s]+/gi, "$1[REDACTED:api_key]")
    .replace(/\bapiKey=[^"',.}\]\s]+/gi, "apiKey=[REDACTED:api_key]")
    .replace(/("authorization"\s*:\s*"Bearer\s*)[^"]+(")/gi, "$1[REDACTED:api_key]$2")
    .replace(
      /\b[A-Za-z0-9._-]*(?:[Pp]ublic[-_])?[Aa][Pp][Ii][-_]?[Kk][Ee][Yy][-_](?=[A-Za-z0-9._-]*(?:[Ss]ecret|[Nn]eedle|[A-Z0-9]))[A-Za-z0-9._-]{8,}\b/g,
      "[REDACTED:api_key]"
    )
    .replace(/\b(telegramBotToken|providerToken|botToken)=([^"',.}\]\s]+)/gi, "$1=[REDACTED:provider_token]")
    .replace(/("providerToken"\s*:\s*")[^"]+(")/gi, "$1[REDACTED:provider_token]$2")
    .replace(
      /\b[A-Za-z0-9._-]*(?:[Pp]rovider[-_]?[Tt]oken|[Bb]ot[-_]?[Tt]oken)[-_](?=[A-Za-z0-9._-]*(?:[Ss]ecret|[Nn]eedle|[A-Z0-9]))[A-Za-z0-9._-]{8,}\b/g,
      "[REDACTED:provider_token]"
    )
    .replace(/bot[^/"',.}\]\s?]+(?=\/sendMessage)/gi, "bot[REDACTED:provider_token]")
    .replace(/sha256=[^"',.}\]\s]+/gi, "[REDACTED:webhook_signature]")
    .replace(/("x-provider-signature"\s*:\s*")[^"]+(")/gi, "$1[REDACTED:webhook_signature]$2")
    .replace(/https?:\/\/[^"',}\]\s]+\/support\/tenant-[^"',}\]\s]+/gi, "[REDACTED:object_key]")
    .replace(/("objectKey"\s*:\s*")[^"]+(")/gi, "$1[REDACTED:object_key]$2")
    .replace(/\btenant-[a-z0-9_-]+\/(?:private|objects|storage|uploads|exports|reports)\/[^"',}\]\s]+/gi, "[REDACTED:object_key]")
    .replace(/\b(object\s+)(?:[a-z0-9._-]+\/)+[a-z0-9._-]+/gi, "$1[REDACTED:object_key]")
    .replace(/objectKey=[^"',.}\]\s]+/gi, "objectKey=[REDACTED:object_key]")
    .replace(/X-Amz-Signature=[^&"',.}\]\s]+/gi, "X-Amz-Signature=[REDACTED:signature]");
}
