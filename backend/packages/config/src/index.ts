import { z } from "zod";

const defaultDemoServiceAdminKey = "dev-service-admin-key";
const knownInsecureCredentialMasterKey = Buffer.alloc(32, 0x11).toString("base64");
const credentialMasterKeyNames = ["PROVIDER_CREDENTIAL_MASTER_KEY", "AI_CONNECTIONS_MASTER_KEY"] as const;
type CredentialMasterKeyName = typeof credentialMasterKeyNames[number];
const optionalNonEmptyString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional()
);
const optionalCredentialMasterKey = optionalNonEmptyString.refine(
  (value) => value === undefined || isCanonical32ByteBase64(value),
  "Must be a canonical base64-encoded 32-byte key."
);

const backendConfigSchema = z.object({
  ALLOW_DEMO_SERVICE_ADMIN_HEADERS: z.enum(["true", "false"]).optional(),
  AI_CONNECTIONS_MASTER_KEY: optionalCredentialMasterKey,
  API_VERSION: z.string().min(1).default("v1"),
  RUNTIME_PROFILE: z.enum(["local", "production-like"]).default("local"),
  BILLING_PROVIDER_MODE: z.enum(["sandbox", "production"]).default("sandbox"),
  BROWSER_PUSH_PUBLIC_KEY: optionalNonEmptyString,
  BROWSER_PUSH_PRIVATE_KEY: optionalNonEmptyString,
  BROWSER_PUSH_SUBJECT: optionalNonEmptyString,
  DATABASE_URL: z.string().url(),
  DEMO_SERVICE_ADMIN_KEY: z.string().min(12).optional(),
  JWT_ACCESS_SECRET: z.string().min(16).optional(),
  JWT_REFRESH_SECRET: z.string().min(16).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOCAL_DEVELOPMENT_SEED_ENABLED: z.enum(["true", "false"]).default("false"),
  MAIL_HOST: z.string().min(1).default("127.0.0.1"),
  MAIL_PORT: z.coerce.number().int().positive().default(1025),
  NODE_ENV: z.enum(["development", "test", "staging", "production"]),
  NOTIFICATION_DELIVERY_INTERVAL_MS: z.string().min(1).optional(),
  NOTIFICATION_DELIVERY_LIMIT: z.string().min(1).optional(),
  NOTIFICATION_DELIVERY_MAX_ATTEMPTS: z.string().min(1).optional(),
  NOTIFICATION_DELIVERY_ONCE: z.enum(["true", "false"]).optional(),
  NOTIFICATION_DELIVERY_PROVIDER_MODE: z.enum(["disabled", "local", "web-push"]).optional(),
  NOTIFICATION_DELIVERY_RETRY_DELAY_MS: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(4100),
  PROVIDER_CREDENTIAL_MASTER_KEY: optionalCredentialMasterKey,
  PUBLIC_API_KEY_SECRET: z.string().min(16).optional(),
  REDIS_URL: z.string().url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_SECRET_KEY: z.string().min(1),
  SERVICE_NAME: z.string().min(1).default("api-gateway")
}).superRefine((config, context) => {
  const isLocalEnvironment = config.NODE_ENV === "development" || config.NODE_ENV === "test";
  const allowsLocalFallbacks = isLocalEnvironment && config.RUNTIME_PROFILE === "local";

  if (allowsLocalFallbacks) {
    return;
  }

  addCredentialMasterKeyIssues(config, context, credentialMasterKeyNames);

  if (config.LOCAL_DEVELOPMENT_SEED_ENABLED === "true") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LOCAL_DEVELOPMENT_SEED_ENABLED"],
      message: "Local development seed cannot be enabled outside the local development/test profile."
    });
  }

  if (config.ALLOW_DEMO_SERVICE_ADMIN_HEADERS === "true") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ALLOW_DEMO_SERVICE_ADMIN_HEADERS"],
      message: "Demo service-admin headers cannot be enabled outside development and test."
    });
  }

  if (!config.DEMO_SERVICE_ADMIN_KEY || config.DEMO_SERVICE_ADMIN_KEY === defaultDemoServiceAdminKey) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DEMO_SERVICE_ADMIN_KEY"],
      message: "DEMO_SERVICE_ADMIN_KEY must be set to a non-default value outside development and test."
    });
  }

  for (const [key, value] of [
    ["JWT_ACCESS_SECRET", config.JWT_ACCESS_SECRET],
    ["JWT_REFRESH_SECRET", config.JWT_REFRESH_SECRET],
    ["PUBLIC_API_KEY_SECRET", config.PUBLIC_API_KEY_SECRET]
  ] as const) {
    if (!value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required outside development and test.`
      });
    }
  }

});

export type BackendConfig = z.infer<typeof backendConfigSchema>;

export function loadBackendConfig(source: NodeJS.ProcessEnv = process.env): BackendConfig {
  const parsed = backendConfigSchema.safeParse({
    ...source,
    DEMO_SERVICE_ADMIN_KEY: source.DEMO_SERVICE_ADMIN_KEY ?? (source.NODE_ENV === "development" || source.NODE_ENV === "test" ? defaultDemoServiceAdminKey : undefined)
  });

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid backend configuration: ${details}`);
  }

  return parsed.data;
}

export function assertProductionRuntimeSafety(source: NodeJS.ProcessEnv = process.env): void {
  loadBackendConfig(source);
}

export interface CredentialMasterKeySafetyOptions {
  required?: readonly CredentialMasterKeyName[];
}

export function assertCredentialMasterKeySafety(
  source: NodeJS.ProcessEnv = process.env,
  options: CredentialMasterKeySafetyOptions = {}
): void {
  const schema = z.object({
    AI_CONNECTIONS_MASTER_KEY: optionalCredentialMasterKey,
    NODE_ENV: z.enum(["development", "test", "staging", "production"]),
    PROVIDER_CREDENTIAL_MASTER_KEY: optionalCredentialMasterKey,
    RUNTIME_PROFILE: z.enum(["local", "production-like"]).default("local")
  }).superRefine((config, context) => {
    const isLocalEnvironment = config.NODE_ENV === "development" || config.NODE_ENV === "test";
    if (isLocalEnvironment && config.RUNTIME_PROFILE === "local") {
      return;
    }
    addCredentialMasterKeyIssues(config, context, options.required ?? credentialMasterKeyNames);
  });
  const parsed = schema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid credential master-key configuration: ${details}`);
  }
}

function addCredentialMasterKeyIssues(
  config: Partial<Record<CredentialMasterKeyName, string | undefined>>,
  context: z.RefinementCtx,
  requiredNames: readonly CredentialMasterKeyName[]
): void {
  for (const key of credentialMasterKeyNames) {
    const value = config[key];
    if (value === knownInsecureCredentialMasterKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must not use the known development fallback outside the local profile.`
      });
    }
  }

  for (const key of requiredNames) {
    if (!config[key]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required outside the local development/test profile.`
      });
    }
  }
}

function isCanonical32ByteBase64(value: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    return false;
  }
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 32 && decoded.toString("base64") === value;
}
