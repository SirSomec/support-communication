import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = resolve(repoRoot, ".playwright-runtime", "api-gateway");

rmSync(runtimeDir, { force: true, recursive: true });
mkdirSync(runtimeDir, { recursive: true });

const storeFiles = {
  AUTOMATION_STORE_FILE: "automation.json",
  BILLING_STORE_FILE: "billing.json",
  BOT_SANDBOX_STORE_FILE: "bot-sandbox.json",
  CONVERSATION_STORE_FILE: "conversation.json",
  IDENTITY_STORE_FILE: "identity.json",
  INTEGRATION_STORE_FILE: "integration.json",
  NOTIFICATION_STORE_FILE: "notification.json",
  OPERATIONS_STORE_FILE: "operations.json",
  PLATFORM_STORE_FILE: "platform.json",
  PRESENCE_STORE_FILE: "presence.json",
  // Without this override the quality store falls back to backend/.env.example's
  // .runtime/quality-store.json and leaks manual reviews between smoke runs.
  QUALITY_STORE_FILE: "quality.json",
  REPORT_STORE_FILE: "report.json",
  ROUTING_STORE_FILE: "routing.json",
  WORKSPACE_STORE_FILE: "workspace.json"
};

const env = {
  ...process.env,
  SERVICE_NAME: "api-gateway-playwright",
  TELEGRAM_POLLING_ENABLED: "false"
};

for (const [name, fileName] of Object.entries(storeFiles)) {
  env[name] = join(runtimeDir, fileName);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", "start:api-gateway"], {
  cwd: resolve(repoRoot, "backend"),
  env,
  shell: process.platform === "win32",
  stdio: "inherit"
});

function forward(signal) {
  if (!child.killed) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
