import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const parent = join(root, ".runtime", "backups");
mkdirSync(parent, { recursive: true });
const target = mkdtempSync(join(parent, "release-gate-"));

try {
  run("scripts/runtime-backup.mjs");
  run("scripts/runtime-restore-drill.mjs");
  process.stdout.write("Backup/restore release gate passed.\n");
} finally {
  rmSync(target, { force: true, recursive: true });
}

function run(script) {
  const result = spawnSync(process.execPath, [script, target], { cwd: root, encoding: "utf8", stdio: "inherit", windowsHide: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
