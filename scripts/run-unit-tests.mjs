import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testDirectory = new URL("../tests/", import.meta.url);
const liveOnlyTests = new Set([
  "backend-api-smoke.test.js",
  "backend-runtime.test.js",
  "pilot-smoke.test.js"
]);
const testFiles = readdirSync(testDirectory)
  .filter((name) => name.endsWith(".test.js") && !liveOnlyTests.has(name))
  .sort()
  .map((name) => fileURLToPath(new URL(name, testDirectory)));

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  stdio: "inherit"
});

process.exit(result.status ?? 1);
