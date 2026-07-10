import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const providerRuntimeEnvNames = [
  "BROWSER_PUSH_ENABLED",
  "BROWSER_PUSH_PRIVATE_KEY",
  "BROWSER_PUSH_PUBLIC_KEY",
  "BROWSER_PUSH_SUBJECT",
  "NOTIFICATION_DELIVERY_PROVIDER_MODE",
  "OUTBOX_CHANNEL_CONNECTORS",
  "OUTBOX_MAX_ENABLED",
  "OUTBOX_MAX_ENDPOINT",
  "OUTBOX_PROVIDER_LIVE_SMOKE_ENABLED",
  "OUTBOX_PROVIDER_LIVE_SMOKE_TELEGRAM_CHAT_ID",
  "OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_ENABLED",
  "OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_MAX_DIALOG_ID",
  "OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_VK_PEER_ID",
  "OUTBOX_SCANNER_BEARER_TOKEN",
  "OUTBOX_SCANNER_ENABLED",
  "OUTBOX_SCANNER_PROVIDER_MODE",
  "OUTBOX_SCANNER_URL",
  "OUTBOX_TELEGRAM_API_BASE_URL",
  "OUTBOX_TELEGRAM_BOT_TOKEN",
  "OUTBOX_TELEGRAM_ENABLED",
  "OUTBOX_VK_ENABLED",
  "OUTBOX_VK_ENDPOINT",
  "LEAD_NOTIFICATION_SMTP_LIVE_SMOKE_ENABLED",
  "MFA_OTP_DELIVERY_MODE",
  "MFA_OTP_HASH_KEY",
  "MFA_OTP_SMTP_FROM",
  "MFA_OTP_SMTP_HOST",
  "MFA_OTP_SMTP_PASSWORD",
  "MFA_OTP_SMTP_PORT",
  "MFA_OTP_SMTP_SECURE",
  "MFA_OTP_SMTP_TIMEOUT_MS",
  "MFA_OTP_SMTP_TLS_REJECT_UNAUTHORIZED",
  "MFA_OTP_SMTP_USERNAME",
  "PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE",
  "PUBLIC_DEMO_NOTIFICATION_SMTP_FROM",
  "PUBLIC_DEMO_NOTIFICATION_SMTP_HOST",
  "PUBLIC_DEMO_NOTIFICATION_SMTP_PASSWORD",
  "PUBLIC_DEMO_NOTIFICATION_SMTP_PORT",
  "PUBLIC_DEMO_NOTIFICATION_SMTP_SECURE",
  "PUBLIC_DEMO_NOTIFICATION_SMTP_TLS_REJECT_UNAUTHORIZED",
  "PUBLIC_DEMO_NOTIFICATION_SMTP_TO",
  "PUBLIC_DEMO_NOTIFICATION_SMTP_USERNAME",
  "TELEGRAM_API_BASE_URL",
  "TELEGRAM_INGRESS_MODE",
  "TELEGRAM_POLLING_ENABLED",
  "TELEGRAM_POLLING_INTERVAL_MS",
  "TELEGRAM_POLLING_LIMIT",
  "TELEGRAM_POLLING_TIMEOUT_MS",
  "TELEGRAM_WEBHOOK_ENABLED",
];

const releaseGateSteps = [
  "npm run test:no-demo-runtime",
  "npm run test:no-visible-stubs",
  "npm run test:services",
  "npm run test:service-admin-utils",
  "npm run test:api-client",
  "npm run test:ui-mutation-guards",
  "npm run test:smoke",
  "npm run test:pilot-flow",
  "npm run test:settings-runtime",
  "npm run test:service-admin-runtime",
  "npm run backend:security:audit",
  "npm run backend:test",
  "npm run backend:tenant-isolation:verify",
  "npm run backend:audit-immutability:verify",
  {
    command: "docker compose up -d postgres redis minio mailpit",
    display: "docker compose up -d postgres redis minio mailpit",
    scrubProviderEnv: true
  },
  {
    command: "npm run backend:release:checklist",
    display: "DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication RELEASE_ALLOW_REMOTE_DATABASE=false RELEASE_TARGET_ENVIRONMENT=local-production-like npm run backend:release:checklist",
    env: {
      DATABASE_URL: "postgresql://support:support@127.0.0.1:56432/support_communication",
      RELEASE_ALLOW_REMOTE_DATABASE: "false",
      RELEASE_TARGET_ENVIRONMENT: "local-production-like"
    }
  },
  {
    command: "cd backend && npm run lead-notification:mailpit-smoke",
    display: "LEAD_NOTIFICATION_MAILPIT_SMOKE_ENABLED=true MAILPIT_API_BASE_URL=http://127.0.0.1:18025 PUBLIC_DEMO_NOTIFICATION_SMTP_HOST=127.0.0.1 PUBLIC_DEMO_NOTIFICATION_SMTP_PORT=11025 cd backend && npm run lead-notification:mailpit-smoke",
    env: {
      LEAD_NOTIFICATION_MAILPIT_SMOKE_ENABLED: "true",
      MAILPIT_API_BASE_URL: "http://127.0.0.1:18025",
      PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE: "smtp",
      PUBLIC_DEMO_NOTIFICATION_SMTP_FROM: "noreply@support-communication.local",
      PUBLIC_DEMO_NOTIFICATION_SMTP_HOST: "127.0.0.1",
      PUBLIC_DEMO_NOTIFICATION_SMTP_PORT: "11025",
      PUBLIC_DEMO_NOTIFICATION_SMTP_TO: "sales@support-communication.local"
    }
  },
  "npm run build",
  {
    command: "docker compose -f docker-compose.yml -f docker-compose.pilot.yml --profile prisma-postgres up -d --build",
    display: "docker compose -f docker-compose.yml -f docker-compose.pilot.yml --profile prisma-postgres up -d --build",
    scrubProviderEnv: true
  },
  "node scripts/compose-health-check.mjs",
  "curl.exe -fsS http://127.0.0.1:8080/",
  "curl.exe -fsS http://127.0.0.1:8080/api/v1/health",
  "curl.exe -fsS http://127.0.0.1:4101/api/v1/health",
  "curl.exe -fsS http://127.0.0.1:4101/api/v1/ready",
  {
    command: "cd backend && npm run file-scan:api-callback-smoke",
    display: "FILE_SCAN_API_CALLBACK_SMOKE_ENABLED=true DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1 cd backend && npm run file-scan:api-callback-smoke",
    env: {
      BACKEND_API_BASE_URL: "http://127.0.0.1:4101/api/v1",
      DATABASE_URL: "postgresql://support:support@127.0.0.1:56432/support_communication",
      FILE_SCAN_API_CALLBACK_SMOKE_ENABLED: "true"
    }
  },
  {
    command: "cd backend && npm run file-scan:external-scanner-smoke",
    display: "BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1 DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication cd backend && npm run file-scan:external-scanner-smoke",
    env: {
      BACKEND_API_BASE_URL: "http://127.0.0.1:4101/api/v1",
      DATABASE_URL: "postgresql://support:support@127.0.0.1:56432/support_communication"
    }
  },
  {
    command: "cd backend && npm run provider:telegram-live-smoke",
    display: "DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication INTEGRATION_REPOSITORY=prisma cd backend && npm run provider:telegram-live-smoke",
    env: {
      DATABASE_URL: "postgresql://support:support@127.0.0.1:56432/support_communication",
      INTEGRATION_REPOSITORY: "prisma"
    }
  },
  {
    command: "cd backend && npm run provider:vk-max-live-smoke",
    display: "DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication cd backend && npm run provider:vk-max-live-smoke",
    env: {
      DATABASE_URL: "postgresql://support:support@127.0.0.1:56432/support_communication"
    }
  },
  {
    command: "cd backend && npm run lead-notification:smtp-live-smoke",
    display: "DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication cd backend && npm run lead-notification:smtp-live-smoke",
    env: {
      DATABASE_URL: "postgresql://support:support@127.0.0.1:56432/support_communication"
    }
  },
  {
    command: "npm run test:pilot-smoke",
    display: "BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1 DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication PILOT_PUBLIC_API_ENVIRONMENT=stage npm run test:pilot-smoke",
    env: {
      BACKEND_API_BASE_URL: "http://127.0.0.1:4101/api/v1",
      DATABASE_URL: "postgresql://support:support@127.0.0.1:56432/support_communication",
      PILOT_PUBLIC_API_ENVIRONMENT: "stage"
    }
  },
  {
    command: "npm run test:backend-api-smoke",
    display: "RUN_BACKEND_API_SMOKE=1 BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1 npm run test:backend-api-smoke",
    env: {
      BACKEND_API_BASE_URL: "http://127.0.0.1:4101/api/v1",
      RUN_BACKEND_API_SMOKE: "1"
    }
  }
];

function stepCommand(step) {
  return typeof step === "string" ? step : step.command;
}

function stepDisplay(step) {
  return typeof step === "string" ? step : step.display;
}

function stepEnv(step) {
  const env = { ...process.env };
  if (typeof step !== "string" && step.scrubProviderEnv) {
    scrubProviderEnv(env);
  }
  return typeof step === "string" ? env : { ...env, ...step.env };
}

function scrubProviderEnv(env) {
  for (const name of providerRuntimeEnvNames) {
    delete env[name];
  }
  return env;
}

const args = new Set(process.argv.slice(2));

if (args.has("--help")) {
  process.stdout.write([
    "Usage: npm run release:gate [-- --list]",
    "",
    "Runs the product Phase 10 release gate in order.",
    "Use --list to print the gate without executing commands.",
    ""
  ].join("\n"));
  process.exit(0);
}

if (args.has("--list")) {
  process.stdout.write("Product release gate steps:\n");
  for (const step of releaseGateSteps) {
    process.stdout.write(`- ${stepDisplay(step)}\n`);
  }
  process.exit(0);
}

for (const step of releaseGateSteps) {
  process.stdout.write(`Running ${stepDisplay(step)}...\n`);
  const result = spawnSync(stepCommand(step), {
    cwd: root,
    env: stepEnv(step),
    shell: true,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stderr.write(`Release gate step failed with exit code ${result.status ?? 1}: ${stepDisplay(step)}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write("Product release gate completed.\n");
