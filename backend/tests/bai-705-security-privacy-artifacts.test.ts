import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("BAI-705 bots AI security privacy review artifacts", () => {
  it("keeps the security/privacy review document with required threat sections", () => {
    const candidates = [
      join(process.cwd(), "../docs/bots-ai-security-privacy-review.md"),
      join(process.cwd(), "docs/bots-ai-security-privacy-review.md")
    ];
    const path = candidates.find((item) => existsSync(item));
    assert.ok(path, "docs/bots-ai-security-privacy-review.md must exist");
    const body = readFileSync(path!, "utf8");
    for (const section of [
      "Threat model",
      "SSRF",
      "Secret leakage",
      "Prompt injection",
      "Cross-tenant",
      "Least privilege",
      "Retention",
      "Dependency"
    ]) {
      assert.match(body, new RegExp(section, "i"), section);
    }
  });

  it("keeps complementary security contract tests in the suite", () => {
    for (const relative of [
      "tests/bai-307-ai-connection-security-contracts.test.ts",
      "tests/bai-006-negative-contracts.test.ts"
    ]) {
      assert.equal(existsSync(join(process.cwd(), relative)), true, relative);
    }
  });
});
