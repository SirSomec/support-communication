export async function waitForMailpitMfaOtp({
  apiBaseUrl = process.env.MAILPIT_API_BASE_URL ?? "http://127.0.0.1:18025",
  challengeId,
  email,
  timeoutMs = 10_000
}) {
  const normalizedApiBaseUrl = requireValue(apiBaseUrl, "MAILPIT_API_BASE_URL").replace(/\/+$/, "");
  const normalizedChallengeId = requireValue(challengeId, "MFA challenge id");
  const normalizedEmail = requireValue(email, "MFA recipient email").toLowerCase();
  const deadline = Date.now() + positiveInteger(timeoutMs, 10_000);

  while (Date.now() < deadline) {
    const summaries = await listMessages(normalizedApiBaseUrl);
    for (const summary of summaries) {
      if (!summary?.ID || !hasRecipient(summary, normalizedEmail)) {
        continue;
      }
      const message = await readJson(
        `${normalizedApiBaseUrl}/api/v1/message/${encodeURIComponent(summary.ID)}`
      );
      const text = String(message.Text ?? "");
      if (!text.includes(`Request reference: ${normalizedChallengeId}`)) {
        continue;
      }
      const match = text.match(/verification code is:\s*(\d{6})/i);
      if (match?.[1]) {
        return match[1];
      }
    }
    await delay(250);
  }

  throw new Error(`mailpit_mfa_otp_not_found:${JSON.stringify({
    challengeId: normalizedChallengeId,
    email: normalizedEmail
  })}`);
}

export async function waitForMailpitRecoveryToken({
  apiBaseUrl = process.env.MAILPIT_API_BASE_URL ?? "http://127.0.0.1:18025",
  email,
  timeoutMs = 10_000
}) {
  const normalizedApiBaseUrl = requireValue(apiBaseUrl, "MAILPIT_API_BASE_URL").replace(/\/+$/, "");
  const normalizedEmail = requireValue(email, "Recovery recipient email").toLowerCase();
  const deadline = Date.now() + positiveInteger(timeoutMs, 10_000);

  while (Date.now() < deadline) {
    const summaries = await listMessages(normalizedApiBaseUrl);
    for (const summary of summaries) {
      if (!summary?.ID || !hasRecipient(summary, normalizedEmail)) {
        continue;
      }
      const message = await readJson(
        `${normalizedApiBaseUrl}/api/v1/message/${encodeURIComponent(summary.ID)}`
      );
      const text = String(message.Text ?? "");
      const match = text.match(/\brecovery_[A-Za-z0-9._~-]{16,512}\b/);
      if (match?.[0]) {
        return match[0];
      }
    }
    await delay(250);
  }

  throw new Error(`mailpit_recovery_token_not_found:${JSON.stringify({ email: normalizedEmail })}`);
}

async function listMessages(apiBaseUrl) {
  const payload = await readJson(`${apiBaseUrl}/api/v1/messages`);
  return Array.isArray(payload.messages) ? payload.messages : [];
}

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`mailpit_api_failed:${response.status}`);
  }
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("mailpit_api_invalid_json");
  }
  return payload;
}

function hasRecipient(message, email) {
  const recipients = Array.isArray(message.To) ? message.To : [];
  return recipients.some((recipient) => String(recipient?.Address ?? "").toLowerCase() === email);
}

function requireValue(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${name} is required.`);
  }
  return normalized;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
