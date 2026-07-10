import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

describe("product release gate", () => {
  it("exposes a single root command for the Phase 10 release gate", () => {
    const packageJson = readJson("package.json");

    assert.equal(packageJson.scripts["release:gate"], "node scripts/release-gate.mjs");
    assert.equal(packageJson.scripts["backend:security:audit"], "cd backend && npm run security:audit");
    assert.ok(existsSync(join(root, "scripts/release-gate.mjs")));
    assert.ok(existsSync(join(root, "scripts/compose-health-check.mjs")));
  });

  it("lists every required Phase 10 release gate step in execution order", () => {
    const result = spawnSync("node", ["scripts/release-gate.mjs", "--list"], {
      cwd: root,
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const listedSteps = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2));

    assert.deepEqual(listedSteps, [
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
      "docker compose up -d postgres redis minio mailpit",
      "DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication RELEASE_ALLOW_REMOTE_DATABASE=false RELEASE_TARGET_ENVIRONMENT=local-production-like npm run backend:release:checklist",
      "LEAD_NOTIFICATION_MAILPIT_SMOKE_ENABLED=true MAILPIT_API_BASE_URL=http://127.0.0.1:18025 PUBLIC_DEMO_NOTIFICATION_SMTP_HOST=127.0.0.1 PUBLIC_DEMO_NOTIFICATION_SMTP_PORT=11025 cd backend && npm run lead-notification:mailpit-smoke",
      "npm run build",
      "docker compose -f docker-compose.yml -f docker-compose.pilot.yml --profile prisma-postgres up -d --build",
      "node scripts/compose-health-check.mjs",
      "curl.exe -fsS http://127.0.0.1:8080/",
      "curl.exe -fsS http://127.0.0.1:8080/api/v1/health",
      "curl.exe -fsS http://127.0.0.1:4101/api/v1/health",
      "curl.exe -fsS http://127.0.0.1:4101/api/v1/ready",
      "FILE_SCAN_API_CALLBACK_SMOKE_ENABLED=true DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1 cd backend && npm run file-scan:api-callback-smoke",
      "BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1 DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication cd backend && npm run file-scan:external-scanner-smoke",
      "DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication INTEGRATION_REPOSITORY=prisma cd backend && npm run provider:telegram-live-smoke",
      "DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication cd backend && npm run provider:vk-max-live-smoke",
      "DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication cd backend && npm run lead-notification:smtp-live-smoke",
      "BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1 DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication PILOT_PUBLIC_API_ENVIRONMENT=stage npm run test:pilot-smoke",
      "RUN_BACKEND_API_SMOKE=1 BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1 npm run test:backend-api-smoke"
    ]);
  });

  it("fails closed before release database mutations target an unexpected host", () => {
    const backendPackageJson = readJson("backend/package.json");
    const releaseChecklist = readFileSync(join(root, "backend/scripts/release-checklist.mjs"), "utf8");
    const releaseGate = readFileSync(join(root, "scripts/release-gate.mjs"), "utf8");
    const preflightPath = join(root, "backend/scripts/release-database-preflight.mjs");
    const baseEnv = { ...process.env };
    delete baseEnv.RELEASE_ALLOW_REMOTE_DATABASE;
    delete baseEnv.RELEASE_TARGET_ENVIRONMENT;

    assert.equal(
      backendPackageJson.scripts["release:database:preflight"],
      "node --env-file=.env.example scripts/release-database-preflight.mjs"
    );
    assert.ok(existsSync(preflightPath));

    const preflightIndex = releaseChecklist.indexOf('script: "release:database:preflight"');
    const migrationIndex = releaseChecklist.indexOf('script: "prisma:migrate:deploy"');
    const seedIndex = releaseChecklist.indexOf('script: "prisma:seed"');
    assert.ok(preflightIndex > -1, "release database preflight is missing");
    assert.ok(preflightIndex < migrationIndex, "database preflight must run before migrations");
    assert.ok(preflightIndex < seedIndex, "database preflight must run before seed");

    const local = spawnSync(process.execPath, [preflightPath], {
      cwd: join(root, "backend"),
      env: {
        ...baseEnv,
        DATABASE_URL: "postgresql://support:secret@127.0.0.1:56432/support_communication"
      },
      encoding: "utf8"
    });
    assert.equal(local.status, 0, local.stderr);
    assert.match(local.stdout, /127\.0\.0\.1/);
    assert.doesNotMatch(local.stdout, /secret/);

    const remote = spawnSync(process.execPath, [preflightPath], {
      cwd: join(root, "backend"),
      env: {
        ...baseEnv,
        DATABASE_URL: "postgresql://release:remote-secret@db.example.com:5432/production"
      },
      encoding: "utf8"
    });
    assert.notEqual(remote.status, 0);
    assert.match(remote.stderr, /RELEASE_ALLOW_REMOTE_DATABASE=true/);
    assert.doesNotMatch(remote.stderr, /remote-secret/);

    const approvedRemote = spawnSync(process.execPath, [preflightPath], {
      cwd: join(root, "backend"),
      env: {
        ...baseEnv,
        DATABASE_URL: "postgresql://release:remote-secret@db.example.com:5432/production",
        RELEASE_ALLOW_REMOTE_DATABASE: "true",
        RELEASE_TARGET_ENVIRONMENT: "staging"
      },
      encoding: "utf8"
    });
    assert.equal(approvedRemote.status, 0, approvedRemote.stderr);
    assert.match(approvedRemote.stdout, /staging/);
    assert.doesNotMatch(approvedRemote.stdout, /remote-secret/);

    assert.match(releaseGate, /RELEASE_ALLOW_REMOTE_DATABASE:\s*"false"/);
    assert.match(releaseGate, /RELEASE_TARGET_ENVIRONMENT:\s*"local-production-like"/);
    assert.match(
      releaseGate,
      /DATABASE_URL:\s*"postgresql:\/\/support:support@127\.0\.0\.1:56432\/support_communication"/
    );
  });

  it("runs production-like compose workers with durable repository configuration", () => {
    const result = spawnSync(
      "docker",
      [
        "compose",
        "-f",
        "docker-compose.yml",
        "-f",
        "docker-compose.pilot.yml",
        "--profile",
        "prisma-postgres",
        "config",
        "--format",
        "json"
      ],
      {
        cwd: root,
        encoding: "utf8"
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    const workerEnv = config.services["notification-delivery-worker"].environment;

    assert.equal(workerEnv.NODE_ENV, "staging");
    assert.equal(workerEnv.RUNTIME_PROFILE, "production-like");
    assert.equal(workerEnv.DATABASE_URL, "postgresql://support:support@postgres:5432/support_communication");
    assert.equal(workerEnv.NOTIFICATION_REPOSITORY, "prisma");
    assert.equal(workerEnv.BROWSER_PUSH_ENABLED, "false");
    assert.equal(workerEnv.BROWSER_PUSH_PUBLIC_KEY, "");
    assert.equal(workerEnv.BROWSER_PUSH_PRIVATE_KEY, "");
    assert.equal(workerEnv.NOTIFICATION_DELIVERY_PROVIDER_MODE, "disabled");
    assert.equal(config.services["api-gateway"].environment.BROWSER_PUSH_PUBLIC_KEY, "");
    assert.equal(config.services["api-gateway"].environment.MFA_OTP_DELIVERY_MODE, "smtp");
    assert.equal(config.services["api-gateway"].environment.MFA_OTP_SMTP_FROM, "noreply@support-communication.local");
    assert.equal(config.services["api-gateway"].environment.MFA_OTP_SMTP_HOST, "mailpit");
    assert.equal(config.services["api-gateway"].environment.MFA_OTP_SMTP_PORT, "1025");

    const leadWorkerEnv = config.services["lead-notification-worker"].environment;
    assert.equal(leadWorkerEnv.NODE_ENV, "staging");
    assert.equal(leadWorkerEnv.RUNTIME_PROFILE, "production-like");
    assert.equal(leadWorkerEnv.DATABASE_URL, "postgresql://support:support@postgres:5432/support_communication");
    assert.equal(leadWorkerEnv.INTEGRATION_REPOSITORY, "prisma");
    assert.equal(leadWorkerEnv.PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE, "disabled");

    const smtpLeadWorkerResult = spawnSync(
      "docker",
      [
        "compose",
        "-f",
        "docker-compose.yml",
        "-f",
        "docker-compose.pilot.yml",
        "--profile",
        "prisma-postgres",
        "config",
        "--format",
        "json"
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE: "smtp",
          PUBLIC_DEMO_NOTIFICATION_SMTP_FROM: "noreply@pilot.example",
          PUBLIC_DEMO_NOTIFICATION_SMTP_HOST: "mailpit",
          PUBLIC_DEMO_NOTIFICATION_SMTP_PASSWORD: "smtp-password",
          PUBLIC_DEMO_NOTIFICATION_SMTP_PORT: "1025",
          PUBLIC_DEMO_NOTIFICATION_SMTP_SECURE: "true",
          PUBLIC_DEMO_NOTIFICATION_SMTP_TLS_REJECT_UNAUTHORIZED: "false",
          PUBLIC_DEMO_NOTIFICATION_SMTP_TO: "sales@pilot.example",
          PUBLIC_DEMO_NOTIFICATION_SMTP_USERNAME: "smtp-user"
        },
        encoding: "utf8"
      }
    );
    assert.equal(smtpLeadWorkerResult.status, 0, smtpLeadWorkerResult.stderr);
    const smtpLeadWorkerEnv = JSON.parse(smtpLeadWorkerResult.stdout).services["lead-notification-worker"].environment;
    assert.equal(smtpLeadWorkerEnv.PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE, "smtp");
    assert.equal(smtpLeadWorkerEnv.PUBLIC_DEMO_NOTIFICATION_SMTP_FROM, "noreply@pilot.example");
    assert.equal(smtpLeadWorkerEnv.PUBLIC_DEMO_NOTIFICATION_SMTP_HOST, "mailpit");
    assert.equal(smtpLeadWorkerEnv.PUBLIC_DEMO_NOTIFICATION_SMTP_PASSWORD, "smtp-password");
    assert.equal(smtpLeadWorkerEnv.PUBLIC_DEMO_NOTIFICATION_SMTP_PORT, "1025");
    assert.equal(smtpLeadWorkerEnv.PUBLIC_DEMO_NOTIFICATION_SMTP_SECURE, "true");
    assert.equal(smtpLeadWorkerEnv.PUBLIC_DEMO_NOTIFICATION_SMTP_TLS_REJECT_UNAUTHORIZED, "false");
    assert.equal(smtpLeadWorkerEnv.PUBLIC_DEMO_NOTIFICATION_SMTP_TO, "sales@pilot.example");
    assert.equal(smtpLeadWorkerEnv.PUBLIC_DEMO_NOTIFICATION_SMTP_USERNAME, "smtp-user");

    const outboxWorker = config.services["outbox-worker"];
    assert.ok(outboxWorker, "outbox-worker service is missing");
    assert.deepEqual(outboxWorker.command, ["node", "apps/outbox-worker/dist/main.js"]);
    const outboxWorkerEnv = outboxWorker.environment;
    assert.equal(outboxWorkerEnv.NODE_ENV, "staging");
    assert.equal(outboxWorkerEnv.RUNTIME_PROFILE, "production-like");
    assert.equal(outboxWorkerEnv.DATABASE_URL, "postgresql://support:support@postgres:5432/support_communication");
    assert.equal(outboxWorkerEnv.SERVICE_NAME, "outbox-worker");
    assert.equal(outboxWorkerEnv.OUTBOX_QUEUE, "message-delivery");
    assert.equal(outboxWorkerEnv.OUTBOX_BATCH_SIZE, "50");
    assert.equal(outboxWorkerEnv.OUTBOX_MAX_ATTEMPTS, "5");
    assert.equal(outboxWorkerEnv.OUTBOX_POLL_INTERVAL_MS, "10000");

    const billingSyncWorker = config.services["billing-sync-worker"];
    assert.ok(billingSyncWorker, "billing-sync-worker service is missing");
    assert.deepEqual(billingSyncWorker.command, ["node", "apps/outbox-worker/dist/main.js", "--billing-sync"]);
    const billingSyncWorkerEnv = billingSyncWorker.environment;
    assert.equal(billingSyncWorkerEnv.NODE_ENV, "staging");
    assert.equal(billingSyncWorkerEnv.RUNTIME_PROFILE, "production-like");
    assert.equal(billingSyncWorkerEnv.DATABASE_URL, "postgresql://support:support@postgres:5432/support_communication");
    assert.equal(billingSyncWorkerEnv.SERVICE_NAME, "billing-sync-worker");
    assert.equal(billingSyncWorkerEnv.BILLING_SYNC_WORKER, "true");
    assert.equal(billingSyncWorkerEnv.OUTBOX_QUEUE, "billing-sync");
    assert.equal(billingSyncWorkerEnv.OUTBOX_BATCH_SIZE, "50");
    assert.equal(billingSyncWorkerEnv.OUTBOX_MAX_ATTEMPTS, "5");

    const proactiveDeliveryWorker = config.services["proactive-delivery-worker"];
    assert.ok(proactiveDeliveryWorker, "proactive-delivery-worker service is missing");
    assert.deepEqual(proactiveDeliveryWorker.command, [
      "node",
      "apps/api-gateway/dist/automation/proactive-delivery.main.js"
    ]);
    const proactiveDeliveryWorkerEnv = proactiveDeliveryWorker.environment;
    assert.equal(proactiveDeliveryWorkerEnv.NODE_ENV, "staging");
    assert.equal(proactiveDeliveryWorkerEnv.RUNTIME_PROFILE, "production-like");
    assert.equal(proactiveDeliveryWorkerEnv.DATABASE_URL, "postgresql://support:support@postgres:5432/support_communication");
    assert.equal(proactiveDeliveryWorkerEnv.AUTOMATION_REPOSITORY, "prisma");
    assert.equal(proactiveDeliveryWorkerEnv.CONVERSATION_REPOSITORY, "prisma");
    assert.equal(proactiveDeliveryWorkerEnv.PROACTIVE_DELIVERY_LIMIT, "50");

    const composeHealthCheck = readFileSync(join(root, "scripts/compose-health-check.mjs"), "utf8");
    assert.match(composeHealthCheck, /"outbox-worker"/);
    assert.match(composeHealthCheck, /"billing-sync-worker"/);
    assert.match(composeHealthCheck, /"report-export-worker"/);
    assert.match(composeHealthCheck, /"proactive-delivery-worker"/);
  });

  it("wires proactive delivery runtime smoke into backend release verification", () => {
    const rootPackageJson = readJson("package.json");
    const backendPackageJson = readJson("backend/package.json");
    const releaseChecklist = readFileSync(join(root, "backend/scripts/release-checklist.mjs"), "utf8");

    assert.equal(
      backendPackageJson.scripts["start:proactive-delivery-worker"],
      "npm run build && node --env-file=.env.example apps/api-gateway/dist/automation/proactive-delivery.main.js"
    );
    assert.equal(
      backendPackageJson.scripts["proactive-delivery:worker:once"],
      "npm run build && node --env-file=.env.example scripts/proactive-delivery-worker-smoke.mjs"
    );
    assert.equal(
      backendPackageJson.scripts["proactive-delivery:prisma-concurrency-smoke"],
      "npm run prisma:generate && npm run build && node --env-file=.env.example scripts/proactive-delivery-prisma-concurrency-smoke.mjs"
    );
    assert.equal(
      rootPackageJson.scripts["backend:proactive-delivery:worker:once"],
      "cd backend && npm run proactive-delivery:worker:once"
    );
    assert.equal(
      rootPackageJson.scripts["backend:proactive-delivery:prisma-concurrency-smoke"],
      "cd backend && npm run proactive-delivery:prisma-concurrency-smoke"
    );
    assert.match(releaseChecklist, /Proactive delivery worker smoke/);
    assert.match(releaseChecklist, /script: "proactive-delivery:worker:once"/);
    assert.match(releaseChecklist, /Proactive delivery Prisma concurrency smoke/);
    assert.match(releaseChecklist, /script: "proactive-delivery:prisma-concurrency-smoke"/);
  });

  it("wires backend dependency audit into release verification", () => {
    const backendPackageJson = readJson("backend/package.json");
    const releaseChecklist = readFileSync(join(root, "backend/scripts/release-checklist.mjs"), "utf8");

    assert.equal(backendPackageJson.scripts["security:audit"], "node scripts/security-audit.mjs");
    assert.ok(existsSync(join(root, "backend/scripts/security-audit.mjs")));
    assert.match(releaseChecklist, /Dependency security audit/);
    assert.match(releaseChecklist, /script: "security:audit"/);
  });

  it("wires a non-skipping self-seeded public SDK smoke into the release gate", () => {
    const packageJson = readJson("package.json");
    const releaseGate = readFileSync(join(root, "scripts/release-gate.mjs"), "utf8");
    const pilotSmoke = readFileSync(join(root, "tests/pilot-smoke.test.js"), "utf8");

    assert.equal(packageJson.scripts["test:pilot-smoke"], "node --test tests/pilot-smoke.test.js");
    assert.match(releaseGate, /npm run test:pilot-smoke/);
    assert.match(releaseGate, /DATABASE_URL:\s*"postgresql:\/\/support:support@127\.0\.0\.1:56432\/support_communication"/);
    assert.doesNotMatch(pilotSmoke, /RUN_PILOT_SMOKE/);
    assert.doesNotMatch(pilotSmoke, /PILOT_OPERATOR_OTP/);
    assert.doesNotMatch(pilotSmoke, /skip:\s*!/);
    assert.match(pilotSmoke, /waitForMailpitMfaOtp/);
    assert.match(pilotSmoke, /publicApiKey\.create/);
    assert.match(pilotSmoke, /DATABASE_URL/);
    assert.match(pilotSmoke, /public\/sdk\/identify/);
    assert.match(pilotSmoke, /public\/sdk\/messages/);
    assert.ok(existsSync(join(root, "scripts/mailpit-mfa-otp.mjs")));
  });

  it("starts local infrastructure before backend checklist and scrubs live provider env from compose steps", () => {
    const result = spawnSync("node", ["scripts/release-gate.mjs", "--list"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.split(/\r?\n/);
    const infraIndex = lines.findIndex((line) => line.includes("docker compose up -d postgres redis minio mailpit"));
    const checklistIndex = lines.findIndex((line) => line.includes("npm run backend:release:checklist"));
    const mailpitSmokeIndex = lines.findIndex((line) => line.includes("npm run lead-notification:mailpit-smoke"));
    const buildIndex = lines.findIndex((line) => line.includes("npm run build"));
    assert.ok(infraIndex > -1, "local infrastructure startup step is missing");
    assert.ok(checklistIndex > -1, "backend release checklist step is missing");
    assert.ok(mailpitSmokeIndex > -1, "Mailpit lead notification smoke step is missing");
    assert.ok(buildIndex > -1, "root build step is missing");
    assert.ok(infraIndex < checklistIndex, "local infrastructure must start before backend release checklist");
    assert.ok(checklistIndex < mailpitSmokeIndex, "Mailpit smoke must run after backend release checklist");
    assert.ok(mailpitSmokeIndex < buildIndex, "Mailpit smoke must run before the root build");

    const releaseGate = readFileSync(join(root, "scripts/release-gate.mjs"), "utf8");
    const releaseChecklist = readFileSync(join(root, "backend/scripts/release-checklist.mjs"), "utf8");
    assert.match(releaseGate, /scrubProviderEnv/);
    assert.match(releaseGate, /BROWSER_PUSH_ENABLED/);
    assert.match(releaseGate, /OUTBOX_CHANNEL_CONNECTORS/);
    assert.match(releaseGate, /OUTBOX_SCANNER_BEARER_TOKEN/);
    assert.match(releaseGate, /OUTBOX_TELEGRAM_BOT_TOKEN/);
    assert.match(releaseGate, /PUBLIC_DEMO_NOTIFICATION_SMTP_TO/);
    assert.match(releaseGate, /LEAD_NOTIFICATION_MAILPIT_SMOKE_ENABLED:\s*"true"/);
    assert.match(releaseGate, /MAILPIT_API_BASE_URL:\s*"http:\/\/127\.0\.0\.1:18025"/);
    assert.match(releaseGate, /PUBLIC_DEMO_NOTIFICATION_SMTP_HOST:\s*"127\.0\.0\.1"/);
    assert.match(releaseGate, /PUBLIC_DEMO_NOTIFICATION_SMTP_PORT:\s*"11025"/);
    assert.doesNotMatch(releaseChecklist, /lead-notification:mailpit-smoke/);
  });

  it("requires a skip-safe provider outbox smoke for Telegram VK and MAX runtime adapters", () => {
    const backendPackageJson = readJson("backend/package.json");
    const releaseChecklist = readFileSync(join(root, "backend/scripts/release-checklist.mjs"), "utf8");
    const smokePath = join(root, "backend/scripts/provider-outbox-smoke.mjs");

    assert.equal(
      backendPackageJson.scripts["provider:outbox:smoke"],
      "npm run build && node --env-file=.env.example scripts/provider-outbox-smoke.mjs"
    );
    assert.ok(existsSync(smokePath));
    assert.match(releaseChecklist, /Provider outbox runtime smoke/);
    assert.match(releaseChecklist, /provider:outbox:smoke/);
    assert.match(releaseChecklist, /OUTBOX_PROVIDER_SMOKE_ENABLED:\s*"true"/);

    const smokeScript = readFileSync(smokePath, "utf8");
    assert.match(smokeScript, /OUTBOX_PROVIDER_SMOKE_ENABLED/);
    assert.match(smokeScript, /OUTBOX_PROVIDER_SMOKE_TELEGRAM_ENABLED/);
    assert.match(smokeScript, /OUTBOX_PROVIDER_SMOKE_VK_ENABLED/);
    assert.match(smokeScript, /OUTBOX_PROVIDER_SMOKE_MAX_ENABLED/);
    assert.match(smokeScript, /OUTBOX_TELEGRAM_ENABLED/);
    assert.match(smokeScript, /OUTBOX_TELEGRAM_API_BASE_URL/);
    assert.match(smokeScript, /OUTBOX_VK_ENABLED/);
    assert.match(smokeScript, /OUTBOX_VK_ENDPOINT/);
    assert.match(smokeScript, /OUTBOX_MAX_ENABLED/);
    assert.match(smokeScript, /OUTBOX_MAX_ENDPOINT/);
    assert.match(smokeScript, /telegramRequests/);
    assert.match(smokeScript, /vkRequests/);
    assert.match(smokeScript, /maxRequests/);
    assert.match(smokeScript, /provider outbox smoke skipped/);
    assert.match(smokeScript, /provider outbox smoke passed/);
    assert.match(smokeScript, /apps\/outbox-worker\/dist\/main\.js/);
    assert.match(smokeScript, /outbox_telegram_\$\{smokePrefix\}_/);
    assert.match(smokeScript, /descriptor_vk_\$\{smokePrefix\}_/);
    assert.match(smokeScript, /message_max_\$\{smokePrefix\}_/);
  });

  it("runs the file scan scanner as a production-like compose worker and backend smoke step", () => {
    const backendPackageJson = readJson("backend/package.json");
    const releaseChecklist = readFileSync(join(root, "backend/scripts/release-checklist.mjs"), "utf8");

    assert.equal(
      backendPackageJson.scripts["start:file-scan-scanner-worker"],
      "npm run build && node --env-file=.env.example apps/outbox-worker/dist/main.js --file-scan-scanner"
    );
    assert.equal(
      backendPackageJson.scripts["file-scan:worker:once"],
      "npm run build && node --env-file=.env.example scripts/file-scan-worker-smoke.mjs"
    );
    assert.ok(existsSync(join(root, "backend/scripts/file-scan-worker-smoke.mjs")));
    assert.match(releaseChecklist, /File scan scanner worker smoke/);
    assert.match(releaseChecklist, /file-scan:worker:once/);

    const result = spawnSync(
      "docker",
      [
        "compose",
        "-f",
        "docker-compose.yml",
        "-f",
        "docker-compose.pilot.yml",
        "--profile",
        "prisma-postgres",
        "--profile",
        "scanner-runtime",
        "config",
        "--format",
        "json"
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          OUTBOX_FILE_SCAN_RESULT_BEARER_TOKEN: "release-gate-scan-token",
          OUTBOX_SCANNER_BEARER_TOKEN: "release-gate-scanner-token",
          OUTBOX_SCANNER_ENABLED: "true",
          OUTBOX_SCANNER_PROVIDER_MODE: "http",
          OUTBOX_SCANNER_URL: "https://scanner.example.test/runtime"
        },
        encoding: "utf8"
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    const worker = config.services["file-scan-scanner-worker"];

    assert.ok(worker, "file-scan-scanner-worker service is missing");
    assert.deepEqual(worker.command, [
      "node",
      "apps/outbox-worker/dist/main.js",
      "--file-scan-scanner"
    ]);
    assert.equal(worker.environment.NODE_ENV, "staging");
    assert.equal(worker.environment.RUNTIME_PROFILE, "production-like");
    assert.equal(worker.environment.DATABASE_URL, "postgresql://support:support@postgres:5432/support_communication");
    assert.equal(worker.environment.OUTBOX_FILE_SCAN_SCANNER_WORKER, "true");
    assert.equal(worker.environment.OUTBOX_SCANNER_ENABLED, "true");
    assert.equal(worker.environment.OUTBOX_SCANNER_BEARER_TOKEN, "release-gate-scanner-token");
    assert.equal(worker.environment.OUTBOX_SCANNER_PROVIDER_MODE, "http");
    assert.equal(worker.environment.OUTBOX_SCANNER_URL, "https://scanner.example.test/runtime");
    assert.equal(worker.environment.OUTBOX_FILE_SCAN_RESULT_BASE_URL, "http://api-gateway:4100/api/v1");
    assert.equal(worker.environment.OUTBOX_FILE_SCAN_RESULT_BEARER_TOKEN, "release-gate-scan-token");
    assert.equal(worker.environment.OUTBOX_QUEUE, "file-scan");

    const localResult = spawnSync(
      "docker",
      [
        "compose",
        "-f",
        "docker-compose.yml",
        "-f",
        "docker-compose.pilot.yml",
        "--profile",
        "prisma-postgres",
        "--profile",
        "scanner-runtime",
        "config",
        "--format",
        "json"
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          OUTBOX_FILE_SCAN_RESULT_BEARER_TOKEN: "release-gate-scan-token",
          OUTBOX_SCANNER_ENABLED: "true"
        },
        encoding: "utf8"
      }
    );

    assert.equal(localResult.status, 0, localResult.stderr);
    const localConfig = JSON.parse(localResult.stdout);
    const localWorkerEnv = localConfig.services["file-scan-scanner-worker"].environment;

    assert.equal(localWorkerEnv.OUTBOX_SCANNER_PROVIDER_MODE, "local");
    assert.equal(localWorkerEnv.OUTBOX_SCANNER_LOCAL_VERDICT, "clean");
    assert.notEqual(localWorkerEnv.OUTBOX_SCANNER_URL, "http://scanner:8080/scan");
  });

  it("wires a live API callback smoke for the file scan scanner into the release gate", () => {
    const backendPackageJson = readJson("backend/package.json");
    const releaseGate = readFileSync(join(root, "scripts/release-gate.mjs"), "utf8");
    const smokePath = join(root, "backend/scripts/file-scan-api-callback-smoke.mjs");

    assert.equal(
      backendPackageJson.scripts["file-scan:api-callback-smoke"],
      "npm run build && node --env-file=.env.example scripts/file-scan-api-callback-smoke.mjs"
    );
    assert.ok(existsSync(smokePath));
    assert.match(releaseGate, /file-scan:api-callback-smoke/);
    assert.match(releaseGate, /FILE_SCAN_API_CALLBACK_SMOKE_ENABLED:\s*"true"/);
    assert.match(releaseGate, /BACKEND_API_BASE_URL:\s*"http:\/\/127\.0\.0\.1:4101\/api\/v1"/);
    assert.match(releaseGate, /DATABASE_URL:\s*"postgresql:\/\/support:support@127\.0\.0\.1:56432\/support_communication"/);

    const skipResult = spawnSync(process.execPath, ["scripts/file-scan-api-callback-smoke.mjs"], {
      cwd: join(root, "backend"),
      env: {
        ...process.env,
        BACKEND_API_BASE_URL: "",
        DATABASE_URL: "",
        FILE_SCAN_API_CALLBACK_SMOKE_ENABLED: "false"
      },
      encoding: "utf8"
    });
    assert.equal(skipResult.status, 0, skipResult.stderr);
    assert.match(skipResult.stdout, /file scan API callback smoke skipped/);
  });

  it("wires a skip-safe external scanner smoke for live scanner providers", () => {
    const backendPackageJson = readJson("backend/package.json");
    const releaseGate = readFileSync(join(root, "scripts/release-gate.mjs"), "utf8");
    const smokePath = join(root, "backend/scripts/file-scan-external-scanner-smoke.mjs");

    assert.equal(
      backendPackageJson.scripts["file-scan:external-scanner-smoke"],
      "npm run build && node --env-file=.env.example scripts/file-scan-external-scanner-smoke.mjs"
    );
    assert.ok(existsSync(smokePath));
    assert.match(releaseGate, /file-scan:external-scanner-smoke/);
    assert.match(releaseGate, /BACKEND_API_BASE_URL:\s*"http:\/\/127\.0\.0\.1:4101\/api\/v1"/);
    assert.match(releaseGate, /DATABASE_URL:\s*"postgresql:\/\/support:support@127\.0\.0\.1:56432\/support_communication"/);
    assert.match(releaseGate, /OUTBOX_SCANNER_URL/);

    const smokeScript = readFileSync(smokePath, "utf8");
    assert.match(smokeScript, /FILE_SCAN_EXTERNAL_SCANNER_SMOKE_ENABLED/);
    assert.match(smokeScript, /FILE_SCAN_EXTERNAL_SCANNER_SIGNED_FILE_URL/);
    assert.match(smokeScript, /FILE_SCAN_EXTERNAL_SCANNER_SIGNED_FILE_EXPIRES_AT/);
    assert.match(smokeScript, /OUTBOX_SCANNER_BEARER_TOKEN/);
    assert.match(smokeScript, /OUTBOX_SCANNER_PROVIDER_MODE:\s*"http"/);
    assert.match(smokeScript, /OUTBOX_SCANNER_URL:\s*scannerUrl/);
    assert.match(smokeScript, /local-deterministic-scanner/);
    assert.match(smokeScript, /file scan external scanner smoke skipped/);
    assert.match(smokeScript, /file scan external scanner smoke passed/);

    const skipResult = spawnSync(process.execPath, ["scripts/file-scan-external-scanner-smoke.mjs"], {
      cwd: join(root, "backend"),
      env: {
        ...process.env,
        BACKEND_API_BASE_URL: "",
        DATABASE_URL: "",
        FILE_SCAN_EXTERNAL_SCANNER_SMOKE_ENABLED: "false",
        OUTBOX_SCANNER_URL: ""
      },
      encoding: "utf8"
    });
    assert.equal(skipResult.status, 0, skipResult.stderr);
    assert.match(skipResult.stdout, /file scan external scanner smoke skipped/);
  });

  it("wires a skip-safe Telegram live provider smoke for real provider credentials", () => {
    const backendPackageJson = readJson("backend/package.json");
    const releaseGate = readFileSync(join(root, "scripts/release-gate.mjs"), "utf8");
    const smokePath = join(root, "backend/scripts/provider-telegram-live-smoke.mjs");

    assert.equal(
      backendPackageJson.scripts["provider:telegram-live-smoke"],
      "npm run build && node --env-file=.env.example scripts/provider-telegram-live-smoke.mjs"
    );
    assert.ok(existsSync(smokePath));
    assert.match(releaseGate, /provider:telegram-live-smoke/);
    assert.match(releaseGate, /INTEGRATION_REPOSITORY:\s*"prisma"/);
    assert.match(releaseGate, /DATABASE_URL:\s*"postgresql:\/\/support:support@127\.0\.0\.1:56432\/support_communication"/);

    const smokeScript = readFileSync(smokePath, "utf8");
    assert.match(smokeScript, /OUTBOX_PROVIDER_LIVE_SMOKE_ENABLED/);
    assert.match(smokeScript, /OUTBOX_PROVIDER_LIVE_SMOKE_TELEGRAM_CHAT_ID/);
    assert.match(smokeScript, /OUTBOX_TELEGRAM_ENABLED:\s*"true"/);
    assert.match(smokeScript, /OUTBOX_TELEGRAM_API_BASE_URL/);
    assert.match(smokeScript, /INTEGRATION_REPOSITORY/);
    assert.match(smokeScript, /Telegram live provider smoke skipped/);
    assert.match(smokeScript, /Telegram live provider smoke passed/);
    assert.match(smokeScript, /apps\/outbox-worker\/dist\/main\.js/);

    const skipResult = spawnSync(process.execPath, ["scripts/provider-telegram-live-smoke.mjs"], {
      cwd: join(root, "backend"),
      env: {
        ...process.env,
        DATABASE_URL: "",
        OUTBOX_PROVIDER_LIVE_SMOKE_ENABLED: "false",
        OUTBOX_PROVIDER_LIVE_SMOKE_TELEGRAM_CHAT_ID: "",
        OUTBOX_TELEGRAM_BOT_TOKEN: ""
      },
      encoding: "utf8"
    });
    assert.equal(skipResult.status, 0, skipResult.stderr);
    assert.match(skipResult.stdout, /Telegram live provider smoke skipped/);
  });

  it("wires a skip-safe VK and MAX live provider smoke for staging proxy endpoints", () => {
    const backendPackageJson = readJson("backend/package.json");
    const releaseGate = readFileSync(join(root, "scripts/release-gate.mjs"), "utf8");
    const smokePath = join(root, "backend/scripts/provider-vk-max-live-smoke.mjs");

    assert.equal(
      backendPackageJson.scripts["provider:vk-max-live-smoke"],
      "npm run build && node --env-file=.env.example scripts/provider-vk-max-live-smoke.mjs"
    );
    assert.ok(existsSync(smokePath));
    assert.match(releaseGate, /provider:vk-max-live-smoke/);
    assert.match(releaseGate, /DATABASE_URL:\s*"postgresql:\/\/support:support@127\.0\.0\.1:56432\/support_communication"/);

    const smokeScript = readFileSync(smokePath, "utf8");
    assert.match(smokeScript, /OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_ENABLED/);
    assert.match(smokeScript, /OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_VK_PEER_ID/);
    assert.match(smokeScript, /OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_MAX_DIALOG_ID/);
    assert.match(smokeScript, /OUTBOX_VK_ENABLED:\s*providerSelected\(providers,\s*"vk"\)\s*\?\s*"true"\s*:\s*"false"/);
    assert.match(smokeScript, /OUTBOX_MAX_ENABLED:\s*providerSelected\(providers,\s*"max"\)\s*\?\s*"true"\s*:\s*"false"/);
    assert.match(smokeScript, /OUTBOX_VK_ENDPOINT/);
    assert.match(smokeScript, /OUTBOX_MAX_ENDPOINT/);
    assert.match(smokeScript, /VK\/MAX live provider smoke skipped/);
    assert.match(smokeScript, /VK\/MAX live provider smoke passed/);
    assert.match(smokeScript, /apps\/outbox-worker\/dist\/main\.js/);

    const skipResult = spawnSync(process.execPath, ["scripts/provider-vk-max-live-smoke.mjs"], {
      cwd: join(root, "backend"),
      env: {
        ...process.env,
        DATABASE_URL: "",
        OUTBOX_MAX_ENDPOINT: "",
        OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_ENABLED: "false",
        OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_MAX_DIALOG_ID: "",
        OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_VK_PEER_ID: "",
        OUTBOX_VK_ENDPOINT: ""
      },
      encoding: "utf8"
    });
    assert.equal(skipResult.status, 0, skipResult.stderr);
    assert.match(skipResult.stdout, /VK\/MAX live provider smoke skipped/);
  });

  it("wires a skip-safe external SMTP acceptance smoke for public demo lead notifications", () => {
    const backendPackageJson = readJson("backend/package.json");
    const releaseGate = readFileSync(join(root, "scripts/release-gate.mjs"), "utf8");
    const smokePath = join(root, "backend/scripts/lead-notification-smtp-live-smoke.mjs");

    assert.equal(
      backendPackageJson.scripts["lead-notification:smtp-live-smoke"],
      "npm run build && node --env-file=.env.example scripts/lead-notification-smtp-live-smoke.mjs"
    );
    assert.ok(existsSync(smokePath));
    assert.match(releaseGate, /lead-notification:smtp-live-smoke/);
    assert.match(releaseGate, /DATABASE_URL:\s*"postgresql:\/\/support:support@127\.0\.0\.1:56432\/support_communication"/);

    const smokeScript = readFileSync(smokePath, "utf8");
    assert.match(smokeScript, /LEAD_NOTIFICATION_SMTP_LIVE_SMOKE_ENABLED/);
    assert.match(smokeScript, /PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE:\s*"smtp"/);
    assert.match(smokeScript, /PUBLIC_DEMO_NOTIFICATION_SMTP_HOST/);
    assert.match(smokeScript, /PUBLIC_DEMO_NOTIFICATION_SMTP_USERNAME/);
    assert.match(smokeScript, /PUBLIC_DEMO_NOTIFICATION_SMTP_PASSWORD/);
    assert.match(smokeScript, /PUBLIC_DEMO_NOTIFICATION_SMTP_SECURE/);
    assert.match(smokeScript, /PUBLIC_DEMO_NOTIFICATION_SMTP_TLS_REJECT_UNAUTHORIZED/);
    assert.match(smokeScript, /smtp-/);
    assert.match(smokeScript, /external SMTP lead notification smoke skipped/);
    assert.match(smokeScript, /external SMTP lead notification smoke passed/);
    assert.match(smokeScript, /apps\/api-gateway\/dist\/integrations\/public-demo-request-notification\.main\.js/);

    const skipResult = spawnSync(process.execPath, ["scripts/lead-notification-smtp-live-smoke.mjs"], {
      cwd: join(root, "backend"),
      env: {
        ...process.env,
        DATABASE_URL: "",
        LEAD_NOTIFICATION_SMTP_LIVE_SMOKE_ENABLED: "false",
        PUBLIC_DEMO_NOTIFICATION_SMTP_HOST: "",
        PUBLIC_DEMO_NOTIFICATION_SMTP_PASSWORD: "",
        PUBLIC_DEMO_NOTIFICATION_SMTP_USERNAME: ""
      },
      encoding: "utf8"
    });
    assert.equal(skipResult.status, 0, skipResult.stderr);
    assert.match(skipResult.stdout, /external SMTP lead notification smoke skipped/);
  });

  it("requires file scan worker smoke to seed and verify one durable scan job", () => {
    const smokeScript = readFileSync(join(root, "backend/scripts/file-scan-worker-smoke.mjs"), "utf8");

    assert.match(smokeScript, /workspaceFile\.(?:create|upsert)/);
    assert.match(smokeScript, /conversationOutboundDescriptor\.(?:create|upsert)/);
    assert.match(smokeScript, /outboxEvent\.(?:create|upsert)/);
    assert.match(smokeScript, /scanned\s*!==\s*1/);
    assert.match(smokeScript, /published\s*!==\s*1/);
    assert.match(smokeScript, /failed\s*!==\s*0/);
    assert.match(smokeScript, /scanVerdict\s*!==\s*["']clean["']/);
    assert.match(smokeScript, /scanState\s*!==\s*["']scan_clean["']/);
  });
});
