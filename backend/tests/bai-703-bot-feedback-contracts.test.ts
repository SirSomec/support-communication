import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resetMetricsRegistry } from "../packages/observability/src/index.ts";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";
import { BotFeedbackRepository } from "../apps/api-gateway/src/automation/bot-feedback.repository.ts";

describe("BAI-703 bot AI feedback loop", () => {
  beforeEach(() => {
    resetMetricsRegistry();
    AutomationRepository.useDefault(AutomationRepository.inMemory());
    BotFeedbackRepository.useDefault(BotFeedbackRepository.inMemory());
  });

  afterEach(() => {
    BotFeedbackRepository.clearDefault();
    AutomationRepository.clearDefault();
    resetMetricsRegistry();
  });

  it("records tenant-scoped feedback and never claims knowledge mutation", async () => {
    const automation = new AutomationService();
    const response = await automation.recordBotAiFeedback(
      {
        citationSourceIds: ["src-faq"],
        conversationId: "maria",
        outcome: "wrong_source",
        scenarioId: "bot-delivery"
      },
      { actor: "op-1", tenantId: "tenant-volga" }
    );

    assert.equal(response.status, "ok");
    assert.equal(response.data.knowledgeMutated, false);
    assert.equal(response.data.reviewRequired, true);
    assert.equal(response.data.feedback.outcome, "wrong_source");
    assert.equal(response.data.feedback.knowledgeMutated, false);
    assert.equal(response.data.feedback.tenantId, "tenant-volga");

    const foreign = await automation.fetchAutomationWorkspace({ tenantId: "tenant-ladoga" });
    assert.equal(foreign.status, "ok");
    assert.equal((foreign.data.telemetry as { feedback: unknown[] }).feedback.length, 0);

    const own = await automation.fetchAutomationWorkspace({ tenantId: "tenant-volga" });
    assert.equal((own.data.telemetry as { feedback: unknown[] }).feedback.length, 1);
  });

  it("is idempotent for the same tenant + idempotency key", async () => {
    const automation = new AutomationService();
    const first = await automation.recordBotAiFeedback(
      { conversationId: "maria", outcome: "helped", idempotencyKey: "fb-1" },
      { actor: "op-1", tenantId: "tenant-volga" }
    );
    const second = await automation.recordBotAiFeedback(
      { conversationId: "maria", outcome: "helped", idempotencyKey: "fb-1" },
      { actor: "op-1", tenantId: "tenant-volga" }
    );

    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    assert.equal(second.data.duplicate, true);
    assert.equal(second.data.feedback.feedbackId, first.data.feedback.feedbackId);
  });

  it("exposes the bot-feedback route with operator permission guards", () => {
    const source = readFileSync(
      join(process.cwd(), "apps/api-gateway/src/automation/automation.controller.ts"),
      "utf8"
    );
    assert.match(source, /@Post\("bot-feedback"\)/);
    assert.match(source, /recordBotAiFeedback/);
    assert.match(source, /RequireTenantOperatorPermission\("automation\.read"\)/);
  });
});
