import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { canonicalSecretNeedles } from "@support-communication/testing";

describe("redaction runtime smoke contracts", () => {
  it("runs bootstrap/config failure smoke without exposing raw secrets", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };

    assert.match(packageJson.scripts["redaction:runtime-smoke"], /scripts\/redaction-runtime-smoke\.mjs/);

    const result = spawnSync("npm", ["run", "redaction:runtime-smoke", "--", "--bootstrap"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        DEMO_SERVICE_ADMIN_KEY: "dev-service-admin-key",
        NODE_ENV: "production",
        OUTBOX_TELEGRAM_BOT_TOKEN: "fake-provider-token-canonical-secret-needle",
        S3_SECRET_KEY: "fake-api-key-canonical-secret-needle-51H8vZ4y"
      },
      shell: true
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = `${result.stdout}\n${result.stderr}`;
    for (const needle of canonicalSecretNeedles) {
      assert.equal(output.includes(needle), false, `runtime smoke leaked ${needle}`);
    }
    assert.match(output, /bootstrap redaction smoke passed/);
    assert.match(output, /Invalid backend configuration/);
    assert.match(output, /\[REDACTED:api_key\]|\[REDACTED:provider_token\]/);
  });

  it("fails closed for unknown redaction runtime smoke modes", () => {
    const result = spawnSync("npm", ["run", "redaction:runtime-smoke", "--", "--bootstrp"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: process.env,
      shell: true
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Unknown redaction runtime smoke mode: --bootstrp/);
  });

  it("runs every implemented redaction runtime smoke by default", () => {
    const result = spawnSync("npm", ["run", "redaction:runtime-smoke"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: process.env,
      shell: true
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = `${result.stdout}\n${result.stderr}`;
    for (const needle of canonicalSecretNeedles) {
      assert.equal(output.includes(needle), false, `default runtime smoke leaked ${needle}`);
    }
    assert.match(output, /bootstrap redaction smoke passed/);
    assert.match(output, /provider redaction smoke passed/);
    assert.match(output, /scanner redaction smoke passed/);
    assert.match(output, /export redaction smoke passed/);
  });

  it("runs provider connector failure smoke without exposing raw secrets", () => {
    const result = spawnSync("npm", ["run", "redaction:runtime-smoke", "--", "--provider"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: process.env,
      shell: true
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = `${result.stdout}\n${result.stderr}`;
    for (const needle of canonicalSecretNeedles) {
      assert.equal(output.includes(needle), false, `provider runtime smoke leaked ${needle}`);
    }
    assert.match(output, /provider redaction smoke passed/);
    assert.match(output, /\[REDACTED:provider_token\]/);
  });

  it("runs scanner/file failure smoke without exposing raw secrets", () => {
    const result = spawnSync("npm", ["run", "redaction:runtime-smoke", "--", "--scanner"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: process.env,
      shell: true
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = `${result.stdout}\n${result.stderr}`;
    for (const needle of canonicalSecretNeedles) {
      assert.equal(output.includes(needle), false, `scanner runtime smoke leaked ${needle}`);
    }
    assert.match(output, /scanner redaction smoke passed/);
    assert.match(output, /\[REDACTED:object_key\]/);
  });

  it("runs export descriptor smoke without exposing raw secrets", () => {
    const result = spawnSync("npm", ["run", "redaction:runtime-smoke", "--", "--export"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: process.env,
      shell: true
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = `${result.stdout}\n${result.stderr}`;
    for (const needle of canonicalSecretNeedles) {
      assert.equal(output.includes(needle), false, `export runtime smoke leaked ${needle}`);
    }
    assert.equal(output.includes("restore-checks/backup-postgres-nightly/artifact.json"), false);
    assert.match(output, /export redaction smoke passed/);
    assert.match(output, /reports\.local\/download/);
    assert.match(output, /operations\/restore-checks\/backup-postgres-nightly\/artifact/);
    assert.match(output, /\[REDACTED:object_key\]/);
  });
});
