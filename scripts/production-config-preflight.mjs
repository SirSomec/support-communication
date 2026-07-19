import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaOnly = process.argv.includes("--schema-only");
const envArgument = process.argv.find((argument) => !argument.startsWith("--") && argument !== process.argv[0] && argument !== process.argv[1]);
const envPath = resolve(root, envArgument || "deploy/env/production.env");
const composePath = resolve(root, "deploy/compose/compose.production.yml");
const env = parseEnv(readFileSync(envPath, "utf8"));

const required = [
  "APP_DOMAIN", "ACME_EMAIL", "FRONTEND_IMAGE", "API_IMAGE", "MIGRATION_IMAGE",
  "DATABASE_URL", "REDIS_URL", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY",
  "MAIL_HOST", "MAIL_FROM", "MFA_OTP_SMTP_FROM", "PUBLIC_DEMO_NOTIFICATION_SMTP_TO",
  "DEMO_SERVICE_ADMIN_KEY", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "PUBLIC_API_KEY_SECRET",
  "PROVIDER_CREDENTIAL_MASTER_KEY", "AI_CONNECTIONS_MASTER_KEY", "FILE_SCAN_CALLBACK_TOKEN",
  "OUTBOX_SCANNER_BEARER_TOKEN", "WEBHOOK_DELIVERY_SIGNING_SECRET", "CLAMAV_ALLOWED_DOWNLOAD_ORIGINS"
];

const issues = [];
for (const key of required) {
  if (!env[key]) issues.push(`${key}: required`);
}

if (!schemaOnly) {
  const placeholder = /\b(REQUIRED|CHANGE[_-]?ME|EXAMPLE)\b/i;
  for (const [key, value] of Object.entries(env)) {
    if (placeholder.test(value) || /(?:^|\.)example\.(?:com|test|internal)$/i.test(value)) {
      issues.push(`${key}: placeholder value is forbidden`);
    }
  }

  for (const key of ["FRONTEND_IMAGE", "API_IMAGE", "MIGRATION_IMAGE"]) {
    if (env[key] && !/(?:@sha256:[a-f0-9]{64}|:sha-[a-f0-9]{7,64})$/i.test(env[key])) {
      issues.push(`${key}: image must use a commit SHA tag or digest`);
    }
  }

  checkUrl("DATABASE_URL", ["postgresql:", "postgres:"]);
  checkUrl("REDIS_URL", ["rediss:"]);
  checkUrl("S3_ENDPOINT", ["https:"]);
  checkUrl("CLAMAV_ALLOWED_DOWNLOAD_ORIGINS", ["https:"]);

  if (env.BACKUP_OFFSITE_ENDPOINT) {
    checkUrl("BACKUP_OFFSITE_ENDPOINT", ["https:"]);
    for (const key of ["BACKUP_OFFSITE_BUCKET", "BACKUP_OFFSITE_ACCESS_KEY", "BACKUP_OFFSITE_SECRET_KEY"]) {
      if (!env[key]) issues.push(`${key}: required when BACKUP_OFFSITE_ENDPOINT is configured`);
    }
  }

  if (env.DATABASE_URL) {
    try {
      const database = new URL(env.DATABASE_URL);
      if (!database.username || !database.password) issues.push("DATABASE_URL: username and password are required");
      if (decodeURIComponent(database.username).toLowerCase() === "support" && decodeURIComponent(database.password).toLowerCase() === "support") {
        issues.push("DATABASE_URL: default local credentials are forbidden");
      }
    } catch {}
  }

  if (env.S3_ACCESS_KEY?.toLowerCase() === "minio" || env.S3_SECRET_KEY?.toLowerCase() === "minio-password") {
    issues.push("S3 credentials: default local MinIO credentials are forbidden");
  }

  for (const key of [
    "DEMO_SERVICE_ADMIN_KEY", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "PUBLIC_API_KEY_SECRET",
    "FILE_SCAN_CALLBACK_TOKEN", "OUTBOX_SCANNER_BEARER_TOKEN", "WEBHOOK_DELIVERY_SIGNING_SECRET"
  ]) {
    if (env[key] && env[key].length < 24) issues.push(`${key}: must be at least 24 characters`);
  }

  for (const key of ["PROVIDER_CREDENTIAL_MASTER_KEY", "AI_CONNECTIONS_MASTER_KEY"]) {
    if (env[key] && !isCanonical32ByteBase64(env[key])) issues.push(`${key}: must be canonical base64 for exactly 32 bytes`);
  }

  if (env.APP_DOMAIN && (/[:/]/.test(env.APP_DOMAIN) || env.APP_DOMAIN.toLowerCase() === "localhost")) {
    issues.push("APP_DOMAIN: must be a public hostname without scheme or path");
  }

  for (const origin of String(env.CORS_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean)) {
    try {
      const parsed = new URL(origin);
      if (!['https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error();
    } catch {
      issues.push(`CORS_ALLOWED_ORIGINS: invalid HTTPS origin ${origin}`);
    }
  }

  const bootstrapEmail = env.BOOTSTRAP_SERVICE_ADMIN_EMAIL || "";
  const bootstrapPassword = env.BOOTSTRAP_SERVICE_ADMIN_PASSWORD || "";
  if (Boolean(bootstrapEmail) !== Boolean(bootstrapPassword)) {
    issues.push("BOOTSTRAP_SERVICE_ADMIN_EMAIL/PASSWORD: both values must be supplied together");
  }
  if (bootstrapEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(bootstrapEmail)) {
    issues.push("BOOTSTRAP_SERVICE_ADMIN_EMAIL: invalid email address");
  }
  if (bootstrapPassword && bootstrapPassword.length < 12) {
    issues.push("BOOTSTRAP_SERVICE_ADMIN_PASSWORD: must be at least 12 characters");
  }
}

const compose = spawnSync("docker", ["compose", "--env-file", envPath, "-f", composePath, "config", "--quiet"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true
});
if (compose.status !== 0) issues.push(`compose: ${(compose.stderr || compose.stdout || "validation failed").trim()}`);

if (issues.length) {
  process.stderr.write(`Production configuration rejected:\n${issues.map((issue) => `- ${issue}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Production configuration is valid (${schemaOnly ? "schema-only" : "deployment"} mode).\n`);

function parseEnv(contents) {
  const result = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

function checkUrl(key, protocols) {
  if (!env[key]) return;
  try {
    const parsed = new URL(env[key]);
    if (!protocols.includes(parsed.protocol)) issues.push(`${key}: protocol must be ${protocols.join(" or ")}`);
  } catch {
    issues.push(`${key}: invalid URL`);
  }
}

function isCanonical32ByteBase64(value) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 32 && decoded.toString("base64") === value;
}
