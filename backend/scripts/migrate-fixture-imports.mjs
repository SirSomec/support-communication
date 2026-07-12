import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, files);
    } else if (/\.(ts|js|mjs)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const replacements = [
  [/from\s+["']([^"']*)\.fixtures\.js["']/g, 'from "$1.types.js"'],
  [/from\s+["']([^"']*)\.fixtures\.ts["']/g, 'from "$1.types.ts"'],
  [/identity\.fixtures\.ts/g, "identity.seed.ts"],
  [/billing\.fixtures\.ts/g, "billing.seed.ts"],
  [/operations\.fixtures\.ts/g, "operations.seed.ts"],
  [/platform\.fixtures\.ts/g, "platform.seed.ts"],
  [/routing\.fixtures\.ts/g, "routing.seed.ts"],
  [/report\.fixtures\.ts/g, "reports.seed.ts"],
  [/automation\.fixtures\.ts/g, "automation.seed.ts"],
  [/quality\.fixtures\.ts/g, "quality.seed.ts"],
  [/integration\.fixtures\.ts/g, "integrations.seed.ts"],
  [/service-admin\.fixtures\.ts/g, "service-admin.seed.ts"],
  [/conversation\.fixtures\.ts/g, "conversation.seed.ts"]
];

const targets = [
  join(root, "backend/apps/api-gateway/src"),
  join(root, "backend/tests"),
  join(root, "backend/scripts"),
  join(root, "tests")
];

let changed = 0;
for (const dir of targets) {
  for (const file of walk(dir)) {
    if (file.includes("split-fixtures") || file.includes("add-seed-type-imports")) continue;
    let source = readFileSync(file, "utf8");
    const original = source;
    for (const [pattern, replacement] of replacements) {
      source = source.replace(pattern, replacement);
    }
    if (source !== original) {
      writeFileSync(file, source);
      changed += 1;
      console.log("updated", file.replace(root + "\\", "").replace(root + "/", ""));
    }
  }
}

console.log(`changed ${changed} files`);
