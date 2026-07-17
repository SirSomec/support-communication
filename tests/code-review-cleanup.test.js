import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("code review dead-code cleanup", () => {
  it("keeps removed compatibility and report helpers out of runtime bundles", () => {
    const access = readFileSync("src/app/access.js", "utf8");
    const reports = readFileSync("backend/apps/api-gateway/src/reports/report.service.ts", "utf8");
    const auth = readFileSync("backend/apps/api-gateway/src/identity/auth.service.ts", "utf8");
    const pilotSmoke = readFileSync("tests/pilot-smoke.test.js", "utf8");

    assert.doesNotMatch(access, /roleAccessProfiles/);
    assert.doesNotMatch(reports, /function (?:rescueRowsForChannel|isMissedRescueRow|slugify)\b/);
    assert.doesNotMatch(auth, /interface LoginContext|\bprivileged\s*=/);
    assert.doesNotMatch(pilotSmoke, /async function patchJson\b/);
  });
});
