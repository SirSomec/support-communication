import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function walkFiles(dir, { extensions, skipDirs = new Set() }) {
  const results = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) {
        continue;
      }

      results.push(...walkFiles(fullPath, { extensions, skipDirs }));
      continue;
    }

    if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }

  return results;
}

function toProjectPath(absolutePath) {
  return relative(root, absolutePath).replaceAll("\\", "/");
}

const BACKEND_RUNTIME_GLOB_SUFFIXES = [".service.ts", ".controller.ts", ".route.ts", ".worker.ts"];
const BACKEND_FIXTURE_ALLOW_PREFIXES = [
  "backend/apps/api-gateway/src/",
  "backend/tests/",
  "backend/scripts/"
];
const BACKEND_FIXTURE_ALLOW_SUFFIXES = [
  ".repository.ts",
  "seed.ts",
  "seed-catalog.ts",
  "bootstrap.ts"
];

function isBackendRuntimeFile(projectPath) {
  if (!projectPath.startsWith("backend/apps/api-gateway/src/")) {
    return false;
  }

  return BACKEND_RUNTIME_GLOB_SUFFIXES.some((suffix) => projectPath.endsWith(suffix));
}

function isBackendFixtureImportAllowed(projectPath) {
  if (projectPath.startsWith("backend/tests/")) {
    return true;
  }

  if (projectPath.startsWith("backend/scripts/")) {
    return true;
  }

  if (projectPath.includes("/seed") || projectPath.endsWith("seed.ts") || projectPath.endsWith("bootstrap.ts")) {
    return true;
  }

  if (projectPath.endsWith(".repository.ts")) {
    return true;
  }

  return false;
}

const DATA_IMPORT_PATTERN = /from\s+["'](?:\.\.\/)+data(?:\.js)?["']|from\s+["'](?:\.\.\/)+data\/[^"']+["']|from\s+["'][^"']*\/src\/data(?:\/[^"']+)?["']|from\s+["']\.\/data(?:\/[^"']+)?["']/;
const MOCK_BACKEND_PATTERN = /mockBackend\.js/;
const DEMO_UI_TOKEN_PATTERN = /demo-ui-/;
const ONBOARDING_UI_TOKEN_PATTERN = /onboarding-ui-/;
const FIXTURE_IMPORT_PATTERN = /from\s+["'][^"']*\.(?:fixtures|seed-catalog)(?:\.(?:js|ts))?["']/;
const DEMO_TENANT_PATTERN = /tenant-demo/;

describe("runtime demo-data guard", () => {
  it("does not allow frontend runtime imports from src/data or mockBackend", () => {
    const frontendRoot = join(root, "src");
    const files = walkFiles(frontendRoot, {
      extensions: [".js", ".jsx"],
      skipDirs: new Set()
    });
    const violations = [];

    for (const absolutePath of files) {
      const projectPath = toProjectPath(absolutePath);
      const source = read(projectPath);

      if (DATA_IMPORT_PATTERN.test(source)) {
        violations.push(`${projectPath}: imports static data module`);
      }

      if (MOCK_BACKEND_PATTERN.test(source)) {
        violations.push(`${projectPath}: imports mockBackend.js`);
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Frontend runtime must not import src/data or mockBackend:\n${violations.join("\n")}`
    );
  });

  it("does not allow local UI access tokens in auth flows", () => {
    const authFiles = [
      "src/features/auth/AuthPage.jsx",
      "src/features/onboarding/OrganizationOnboarding.jsx"
    ];
    const violations = [];

    for (const file of authFiles) {
      const source = read(file);

      if (DEMO_UI_TOKEN_PATTERN.test(source)) {
        violations.push(`${file}: writes demo-ui-* access token`);
      }

      if (ONBOARDING_UI_TOKEN_PATTERN.test(source)) {
        violations.push(`${file}: writes onboarding-ui-* access token`);
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Auth flows must not mint local UI tokens:\n${violations.join("\n")}`
    );
  });

  it("does not allow backend runtime imports from *.fixtures.ts", () => {
    const backendRoot = join(root, "backend/apps/api-gateway/src");
    const files = walkFiles(backendRoot, {
      extensions: [".ts"],
      skipDirs: new Set(["node_modules"])
    });
    const violations = [];

    for (const absolutePath of files) {
      const projectPath = toProjectPath(absolutePath);

      if (!isBackendRuntimeFile(projectPath) && !projectPath.endsWith(".ts")) {
        continue;
      }

      if (!FIXTURE_IMPORT_PATTERN.test(read(projectPath))) {
        continue;
      }

      if (isBackendFixtureImportAllowed(projectPath)) {
        continue;
      }

      if (isBackendRuntimeFile(projectPath)) {
        violations.push(`${projectPath}: imports *.fixtures.ts in runtime path`);
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Backend runtime services must not import fixtures:\n${violations.join("\n")}`
    );
  });

  it("does not allow tenant-demo fallbacks in backend runtime paths", () => {
    const backendRoot = join(root, "backend/apps/api-gateway/src");
    const files = walkFiles(backendRoot, {
      extensions: [".ts"],
      skipDirs: new Set(["node_modules"])
    });
    const violations = [];

    for (const absolutePath of files) {
      const projectPath = toProjectPath(absolutePath);
      if (!isBackendRuntimeFile(projectPath)) {
        continue;
      }

      if (DEMO_TENANT_PATTERN.test(read(projectPath))) {
        violations.push(`${projectPath}: contains tenant-demo runtime fallback`);
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Backend runtime services must require tenant context instead of tenant-demo:\n${violations.join("\n")}`
    );
  });
});
