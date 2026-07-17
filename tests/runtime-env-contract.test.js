import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const envExample = readFileSync(new URL("../backend/.env.example", import.meta.url), "utf8");
const configSource = readFileSync(new URL("../backend/packages/config/src/index.ts", import.meta.url), "utf8");
const rootCompose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
const releaseGate = readFileSync(new URL("../scripts/release-gate.mjs", import.meta.url), "utf8");
const composeSources = [
  rootCompose,
  readFileSync(new URL("../backend/docker/docker-compose.yml", import.meta.url), "utf8")
];
const declared = new Set(
  envExample.split(/\r?\n/)
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter(Boolean)
);

describe("runtime environment documentation", () => {
  it("documents every core backend config key", () => {
    const schemaBlock = configSource.match(/const backendConfigSchema = z\.object\(\{([\s\S]*?)\}\)\.superRefine/)?.[1] ?? "";
    const configKeys = [...schemaBlock.matchAll(/^\s*([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]);
    assert.deepEqual(configKeys.filter((key) => !declared.has(key)), []);
  });

  it("documents every operator-overridable Docker Compose variable", () => {
    const composeKeys = new Set(
      composeSources.flatMap((source) => [...source.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]))
    );
    assert.deepEqual([...composeKeys].filter((key) => !declared.has(key)).sort(), []);
  });

  it("does not provide predictable production-like credential master keys", () => {
    const knownKey = Buffer.alloc(32, 0x11).toString("base64");
    assert.doesNotMatch(rootCompose, new RegExp(knownKey.replace(/[+]/g, "\\+")));
    assert.match(rootCompose, /PROVIDER_CREDENTIAL_MASTER_KEY:\s*\$\{PROVIDER_CREDENTIAL_MASTER_KEY:-\}/);
    assert.match(rootCompose, /AI_CONNECTIONS_MASTER_KEY:\s*\$\{AI_CONNECTIONS_MASTER_KEY:-\}/);
    assert.doesNotMatch(envExample, new RegExp(knownKey.replace(/[+]/g, "\\+")));
    assert.match(configSource, /assertCredentialMasterKeySafety/);
    assert.match(configSource, /isCanonical32ByteBase64/);
    assert.match(releaseGate, /randomBytes\(32\)\.toString\("base64"\)/);
  });
});
