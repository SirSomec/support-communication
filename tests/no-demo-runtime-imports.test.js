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

const BACKEND_RUNTIME_GLOB_SUFFIXES = [
  ".service.ts",
  ".controller.ts",
  ".route.ts",
  ".worker.ts",
  ".repository.ts",
  ".adapter.ts",
  ".bootstrap.ts",
  "/bootstrap.ts",
  ".main.ts"
];
const KNOWN_RUNTIME_SEED_IMPORTS = new Set();
const KNOWN_PRISMA_ID_DEFAULTS = new Set();
const KNOWN_RUNTIME_TENANT_FALLBACKS = new Set();

function isBackendRuntimeFile(projectPath) {
  if (!projectPath.startsWith("backend/apps/api-gateway/src/")) {
    return false;
  }

  return BACKEND_RUNTIME_GLOB_SUFFIXES.some((suffix) => projectPath.endsWith(suffix));
}

const DATA_IMPORT_PATTERN = /from\s+["'](?:\.\.\/)+data(?:\.js)?["']|from\s+["'](?:\.\.\/)+data\/[^"']+["']|from\s+["'][^"']*\/src\/data(?:\/[^"']+)?["']|from\s+["']\.\/data(?:\/[^"']+)?["']/;
const MOCK_BACKEND_PATTERN = /mockBackend\.js/;
const DEMO_UI_TOKEN_PATTERN = /demo-ui-/;
const ONBOARDING_UI_TOKEN_PATTERN = /onboarding-ui-/;
const TENANT_FALLBACK_PATTERN = /(?:\?\?|\|\|)\s*["']tenant-(?:demo|volga)["']|DEFAULT_TENANT_ID\s*=\s*["']tenant-(?:demo|volga)["']/;

function extractModuleSpecifiers(source) {
  const specifiers = [];
  for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
    specifiers.push(match[1]);
  }
  for (const match of source.matchAll(/\bimport\s+["']([^"']+)["']/g)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function isFixtureModuleSpecifier(specifier) {
  return /(?:^|\/)(?:seed(?:-catalog)?|[^/]+\.fixtures)(?:\.(?:js|ts))?$/.test(specifier);
}

function collectPrismaIdDefaults(source) {
  const violations = [];
  let model = "";
  for (const line of source.split(/\r?\n/)) {
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      model = modelMatch[1];
      continue;
    }
    if (line.trim() === "}") {
      model = "";
      continue;
    }
    const fieldMatch = line.match(/^\s*(tenantId|userId|providerId)\s+\w+[^\n]*@default\(\s*["'][^"']+["']\s*\)/);
    if (model && fieldMatch) {
      violations.push(`${model}.${fieldMatch[1]}`);
    }
  }
  return violations.sort();
}

function methodBody(source, methodName) {
  const start = source.indexOf(`async ${methodName}(`);
  if (start === -1) return "";
  const next = source.indexOf("\n  async ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

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

  it("detects backend runtime imports from fixture and seed catalogs", () => {
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
      if (extractModuleSpecifiers(read(projectPath)).some(isFixtureModuleSpecifier)) {
        violations.push(projectPath);
      }
    }

    const unexpected = violations.filter((path) => !KNOWN_RUNTIME_SEED_IMPORTS.has(path));
    assert.deepEqual(
      unexpected,
      [],
      `New backend runtime fixture imports are forbidden:\n${unexpected.join("\n")}`
    );
    assert.match(read("docs/product-completeness-register.md"), /product-gap:runtime-fixtures/);
  });

  it("classifies seed-catalog and fixture module specifiers without false positives", () => {
    assert.equal(isFixtureModuleSpecifier("./seed-catalog.js"), true);
    assert.equal(isFixtureModuleSpecifier("../catalog/conversation.fixtures.ts"), true);
    assert.equal(isFixtureModuleSpecifier("./seed.ts"), true);
    assert.equal(isFixtureModuleSpecifier("./fixture-model.js"), false);
  });

  it("detects hardcoded Prisma defaults for tenant, user and provider ids", () => {
    const violations = collectPrismaIdDefaults(read("backend/prisma/schema.prisma"));
    const unexpected = violations.filter((item) => !KNOWN_PRISMA_ID_DEFAULTS.has(item));

    assert.deepEqual(unexpected, [], `New hardcoded Prisma id defaults are forbidden:\n${unexpected.join("\n")}`);
    assert.match(read("docs/product-completeness-register.md"), /product-gap:runtime-fixtures/);
  });

  it("requires Quality write APIs to persist before returning success evidence", () => {
    const source = read("backend/apps/api-gateway/src/quality/quality.service.ts");
    const contracts = [
      ["recordClientQualityRating", "await this.qualityRepository.saveQualityRating("],
      ["recordManualQaReview", "await this.qualityRepository.saveManualQaReview("],
      ["scoreDraftResponse", "await this.qualityRepository.saveAiScoringAudit("]
    ];

    for (const [methodName, persistenceCall] of contracts) {
      const body = methodBody(source, methodName);
      assert.ok(body.includes(persistenceCall), `${methodName} must persist through ${persistenceCall}`);
      assert.ok(body.indexOf(persistenceCall) < body.lastIndexOf("return createEnvelope("), `${methodName} must persist before success`);
    }
  });

  it("does not allow demo or Volga tenant fallbacks in backend runtime paths", () => {
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

      if (TENANT_FALLBACK_PATTERN.test(read(projectPath))) {
        violations.push(`${projectPath}: contains hardcoded tenant runtime fallback`);
      }
    }

    const unexpected = violations.filter((entry) => !KNOWN_RUNTIME_TENANT_FALLBACKS.has(entry.split(": contains")[0]));
    assert.deepEqual(
      unexpected,
      [],
      `Backend runtime services must require tenant context instead of demo/Volga fallback:\n${unexpected.join("\n")}`
    );
    assert.match(read("docs/product-completeness-register.md"), /product-gap:runtime-fixtures/);
  });
});
