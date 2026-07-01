export function createTestEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    API_VERSION: "v1",
    BILLING_REPOSITORY: "json",
    DATABASE_URL: "postgresql://support:support@127.0.0.1:5432/support_communication",
    DEMO_SERVICE_ADMIN_KEY: "dev-service-admin-key",
    LOG_LEVEL: "info",
    MAIL_HOST: "127.0.0.1",
    MAIL_PORT: "1025",
    NODE_ENV: "test",
    PORT: "4100",
    REDIS_URL: "redis://127.0.0.1:6379",
    S3_ACCESS_KEY: "minio",
    S3_BUCKET: "support-communication-local",
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_REGION: "us-east-1",
    S3_SECRET_KEY: "minio-password",
    SERVICE_NAME: "api-gateway",
    ...overrides
  };
}

export type CanonicalSecretCategory = "api_key" | "provider_token" | "webhook_signature" | "object_key";
export type CanonicalSecretSurface = "log" | "envelope" | "provider_failure" | "export_descriptor";

export interface CanonicalSecretCarrier {
  surface: CanonicalSecretSurface;
  value: string;
}

export interface CanonicalSecretFixture {
  id: string;
  category: CanonicalSecretCategory;
  raw: string;
  redacted: string;
  carriers: readonly CanonicalSecretCarrier[];
}

export const canonicalSecretBearingFixtures = {
  publicApiKey: {
    id: "public-api-key",
    category: "api_key",
    raw: "fake-api-key-canonical-secret-needle-51H8vZ4y",
    redacted: "[REDACTED:api_key]",
    carriers: [
      { surface: "log", value: "authorization=Bearer fake-api-key-canonical-secret-needle-51H8vZ4y" },
      { surface: "envelope", value: "{\"headers\":{\"authorization\":\"Bearer fake-api-key-canonical-secret-needle-51H8vZ4y\"}}" },
      { surface: "provider_failure", value: "public API authentication failed for key fake-api-key-canonical-secret-needle-51H8vZ4y" },
      { surface: "export_descriptor", value: "apiKey=fake-api-key-canonical-secret-needle-51H8vZ4y" }
    ]
  },
  providerToken: {
    id: "provider-token",
    category: "provider_token",
    raw: "fake-provider-token-canonical-secret-needle",
    redacted: "[REDACTED:provider_token]",
    carriers: [
      { surface: "log", value: "telegramBotToken=fake-provider-token-canonical-secret-needle" },
      { surface: "envelope", value: "{\"providerToken\":\"fake-provider-token-canonical-secret-needle\"}" },
      { surface: "provider_failure", value: "https://telegram.provider.example.test/botfake-provider-token-canonical-secret-needle/sendMessage" },
      { surface: "export_descriptor", value: "providerToken=fake-provider-token-canonical-secret-needle" }
    ]
  },
  webhookSignature: {
    id: "webhook-signature",
    category: "webhook_signature",
    raw: "sha256=canonicalWebhookSignatureSecretNeedle",
    redacted: "[REDACTED:webhook_signature]",
    carriers: [
      { surface: "log", value: "x-provider-signature=sha256=canonicalWebhookSignatureSecretNeedle" },
      { surface: "envelope", value: "{\"headers\":{\"x-provider-signature\":\"sha256=canonicalWebhookSignatureSecretNeedle\"}}" },
      { surface: "provider_failure", value: "webhook signature mismatch: sha256=canonicalWebhookSignatureSecretNeedle" },
      { surface: "export_descriptor", value: "webhookSignature=sha256=canonicalWebhookSignatureSecretNeedle" }
    ]
  },
  objectKey: {
    id: "object-key",
    category: "object_key",
    raw: "tenant-volga/private/export/canonical-object-key-secret.csv",
    redacted: "[REDACTED:object_key]",
    carriers: [
      { surface: "log", value: "objectKey=tenant-volga/private/export/canonical-object-key-secret.csv" },
      { surface: "envelope", value: "{\"objectKey\":\"tenant-volga/private/export/canonical-object-key-secret.csv\"}" },
      { surface: "provider_failure", value: "scanner failed to read object tenant-volga/private/export/canonical-object-key-secret.csv" },
      { surface: "export_descriptor", value: "https://storage.example.test/support/tenant-volga/private/export/canonical-object-key-secret.csv?X-Amz-Signature=canonical" }
    ]
  }
} as const satisfies Record<string, CanonicalSecretFixture>;

export const canonicalSecretNeedles = Object.freeze([
  ...new Set(
    Object.values(canonicalSecretBearingFixtures).flatMap((fixture) => [
      fixture.raw,
      ...fixture.carriers.map((carrier) => carrier.value)
    ])
  )
]) as readonly string[];

export function assertLogRecordsDoNotLeakCanonicalSecrets(records: readonly string[]): void {
  for (const [index, record] of records.entries()) {
    for (const needle of canonicalSecretNeedles) {
      if (record.includes(needle)) {
        throw new Error(`Canonical secret leaked in log record ${index}: ${needle}`);
      }
    }
  }
}
