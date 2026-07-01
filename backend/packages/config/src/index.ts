import { z } from "zod";

const defaultDemoServiceAdminKey = "dev-service-admin-key";

const backendConfigSchema = z.object({
  API_VERSION: z.string().min(1).default("v1"),
  AUTOMATION_STORE_FILE: z.string().min(1).optional(),
  BILLING_REPOSITORY: z.enum(["json", "prisma"]).default("json"),
  BILLING_STORE_FILE: z.string().min(1).optional(),
  CONVERSATION_REPOSITORY: z.enum(["json", "prisma"]).default("json"),
  CONVERSATION_STORE_FILE: z.string().min(1).optional(),
  DATABASE_URL: z.string().url(),
  DEMO_SERVICE_ADMIN_KEY: z.string().min(12),
  IDENTITY_REPOSITORY: z.enum(["json", "prisma"]).default("json"),
  IDENTITY_STORE_FILE: z.string().min(1).optional(),
  INTEGRATION_STORE_FILE: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  MAIL_HOST: z.string().min(1).default("127.0.0.1"),
  MAIL_PORT: z.coerce.number().int().positive().default(1025),
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  OPERATIONS_STORE_FILE: z.string().min(1).optional(),
  PLATFORM_STORE_FILE: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(4100),
  REDIS_URL: z.string().url(),
  REPORT_STORE_FILE: z.string().min(1).optional(),
  ROUTING_REPOSITORY: z.enum(["json", "prisma"]).default("json"),
  ROUTING_STORE_FILE: z.string().min(1).optional(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_SECRET_KEY: z.string().min(1),
  SERVICE_NAME: z.string().min(1).default("api-gateway"),
  WORKSPACE_REPOSITORY: z.enum(["json", "prisma"]).default("json"),
  WORKSPACE_STORE_FILE: z.string().min(1).optional()
}).superRefine((config, context) => {
  if (["production", "staging"].includes(config.NODE_ENV) && config.DEMO_SERVICE_ADMIN_KEY === defaultDemoServiceAdminKey) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DEMO_SERVICE_ADMIN_KEY"],
      message: "DEMO_SERVICE_ADMIN_KEY must be set to a non-default value outside development and test."
    });
  }
});

export type BackendConfig = z.infer<typeof backendConfigSchema>;

export function loadBackendConfig(source: NodeJS.ProcessEnv = process.env): BackendConfig {
  const parsed = backendConfigSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid backend configuration: ${details}`);
  }

  return parsed.data;
}
