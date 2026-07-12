import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AutomationController } from "../apps/api-gateway/dist/automation/automation.controller.js";
import { AutomationEnvelopeDto, BotScenarioActionDto, BotScenarioMutationDto, BotScenarioPublishDto, BotScenarioTestRunDto } from "../apps/api-gateway/dist/automation/automation.openapi.dto.js";

describe("automation scenario OpenAPI contract", () => {
  it("emits Swagger metadata for current and legacy routes, bodies, envelopes and idempotency headers", () => {
    const prototype = AutomationController.prototype;
    const metadata = (method: keyof AutomationController) => ({
      operation: Reflect.getMetadata("swagger/apiOperation", prototype[method]),
      parameters: Reflect.getMetadata("swagger/apiParameters", prototype[method]) as Array<Record<string, unknown>>,
      responses: Reflect.getMetadata("swagger/apiResponse", prototype[method]) as Record<string, unknown>
    });
    const list = metadata("listBotScenarios"); const detail = metadata("fetchBotScenario");
    const create = metadata("createBotScenario"); const update = metadata("updateBotScenario");
    const publish = metadata("publishBotScenarioAlias"); const legacyPublish = metadata("publishBotScenario");
    const testRun = metadata("testBotScenario"); const disable = metadata("disableBotScenario");
    const archive = metadata("archiveBotScenario"); const restore = metadata("restoreBotScenario");
    assert.equal(list.operation.operationId, "listBotScenarios"); assert.ok(list.responses["200"]);
    assert.equal(detail.operation.operationId, "fetchBotScenario"); assert.ok(detail.parameters.some((item) => item.in === "path"));
    assert.equal(create.parameters.find((item) => item.in === "body")?.type, BotScenarioMutationDto);
    assert.equal(update.parameters.find((item) => item.in === "body")?.type, BotScenarioMutationDto);
    for (const item of [publish, legacyPublish]) assert.equal(item.parameters.find((parameter) => parameter.in === "body")?.type, BotScenarioPublishDto);
    assert.equal(testRun.parameters.find((item) => item.in === "body")?.type, BotScenarioTestRunDto);
    for (const item of [disable, archive, restore]) {
      assert.equal(item.parameters.find((parameter) => parameter.in === "body")?.type, BotScenarioActionDto);
      assert.ok(item.parameters.some((parameter) => parameter.in === "header" && parameter.name === "Idempotency-Key"));
    }
    assert.ok(Reflect.getMetadataKeys(AutomationEnvelopeDto.prototype));
  });
});
