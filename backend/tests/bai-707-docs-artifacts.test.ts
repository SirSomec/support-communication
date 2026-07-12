import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("BAI-707 bots AI user and ops documentation", () => {
  it("keeps user guide, runbook and security review with operational topics", () => {
    const docsRootCandidates = [join(process.cwd(), "../docs"), join(process.cwd(), "docs")];
    const docsRoot = docsRootCandidates.find((path) => existsSync(path));
    assert.ok(docsRoot);

    const userGuide = readFileSync(join(docsRoot!, "bots-ai-user-guide-ru.md"), "utf8");
    for (const topic of ["Источник", "фраз", "handoff", "Восстановлен", "Диагностик", "Эскалац"]) {
      assert.match(userGuide, new RegExp(topic, "i"), topic);
    }

    const runbook = readFileSync(join(docsRoot!, "bots-ai-operations-runbook.md"), "utf8");
    assert.match(runbook, /Kill switch/i);
    assert.match(runbook, /ai_agents_v1/);
    assert.match(runbook, /bots-ai-user-guide-ru/);

    const projectDocs = readFileSync(join(docsRoot!, "project-documentation-ru.md"), "utf8");
    assert.match(projectDocs, /bots-ai-user-guide-ru/);
  });
});
