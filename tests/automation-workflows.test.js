import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  changeBotScenarioLifecycle,
  publishBotScenario,
  runBotScenarioTest,
  submitBotScenarioUpdate
} from "../src/app/automationScenarioActions.js";

describe("automation workflow actions", () => {
  it("does not return an updated scenario when backend save fails", async () => {
    const result = await submitBotScenarioUpdate(
      { id: "bot-checkout", name: "Checkout" },
      {
        updateBotScenario: async () => ({
          error: { message: "tenant_context_required" },
          status: "invalid"
        })
      }
    );

    assert.equal(result.ok, false);
    assert.equal(result.scenario, undefined);
    assert.equal(result.message, "tenant_context_required");
  });

  it("uses backend scenario evidence on draft save success", async () => {
    let capturedId = "";
    let capturedPayload = null;
    const result = await submitBotScenarioUpdate(
      { id: "bot-checkout", name: "Checkout" },
      {
        updateBotScenario: async (scenarioId, payload) => {
          capturedId = scenarioId;
          capturedPayload = payload;
          return {
            data: {
              scenario: { ...payload, status: "draft", updatedAt: "2026-07-02T12:00:00.000Z" }
            },
            status: "ok"
          };
        }
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.scenario.status, "draft");
    assert.equal(capturedId, "bot-checkout");
    assert.equal(capturedPayload.name, "Checkout");
  });

  it("does not report publish success without a runtime version", async () => {
    const result = await publishBotScenario(
      { id: "bot-checkout", name: "Checkout" },
      {
        publishBotScenario: async () => ({
          data: { scenarioId: "bot-checkout" },
          status: "ok"
        })
      }
    );

    assert.equal(result.ok, false);
    assert.equal(result.runtimeVersion, undefined);
  });

  it("returns runtime metadata on publish success", async () => {
    const result = await publishBotScenario(
      { id: "bot-checkout", name: "Checkout" },
      {
        publishBotScenario: async () => ({
          data: {
            auditId: "evt_bot_publish",
            runtimeVersion: "runtime-bot-checkout-001",
            scenarioId: "bot-checkout",
            versionState: "published"
          },
          status: "ok"
        })
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.runtimeVersion, "runtime-bot-checkout-001");
    assert.equal(result.versionState, "published");
  });

  it("does not show a test run id when backend rejects the run", async () => {
    const result = await runBotScenarioTest(
      { id: "bot-checkout", name: "Checkout" },
      {
        testBotScenario: async () => ({
          error: { message: "Bot scenario was not found." },
          status: "invalid"
        })
      }
    );

    assert.equal(result.ok, false);
    assert.equal(result.testRunId, undefined);
    assert.match(result.message, /not found/);
  });

  it("returns test run evidence on backend success", async () => {
    const result = await runBotScenarioTest(
      { id: "bot-checkout", name: "Checkout" },
      {
        testBotScenario: async () => ({
          data: {
            auditId: "evt_bot_test",
            queue: "bot-runtime",
            status: "running",
            testRunId: "bot_test_001"
          },
          status: "ok"
        })
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.testRunId, "bot_test_001");
    assert.equal(result.queue, "bot-runtime");
  });

  it("returns the server scenario after a lifecycle action", async () => {
    let capturedId = "";
    const result = await changeBotScenarioLifecycle("bot-checkout", "archive", {
      archiveBotScenario: async (scenarioId) => {
        capturedId = scenarioId;
        return { data: { duplicate: false, scenario: { id: scenarioId, status: "archived" } }, status: "ok" };
      }
    });

    assert.equal(capturedId, "bot-checkout");
    assert.equal(result.ok, true);
    assert.equal(result.scenario.status, "archived");
  });

  it("does not invent lifecycle success when the server rejects it", async () => {
    const result = await changeBotScenarioLifecycle("bot-checkout", "restore", {
      restoreBotScenario: async () => ({ error: { message: "Scenario is on legal hold." }, status: "conflict" })
    });

    assert.equal(result.ok, false);
    assert.equal(result.scenario, undefined);
    assert.match(result.message, /legal hold/);
  });
});
