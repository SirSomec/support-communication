import { automationService } from "../services/automationService.js";

export async function submitBotScenarioUpdate(
  scenario,
  { updateBotScenario = automationService.updateBotScenario } = {}
) {
  const scenarioId = String(scenario?.id ?? "").trim();
  if (!scenarioId) {
    return { ok: false, message: "Bot scenario id is required." };
  }

  const response = await updateBotScenario(scenarioId, scenario);
  if (response.status !== "ok" || !response.data?.scenario) {
    return {
      ok: false,
      message: response.error?.message ?? "Не удалось сохранить сценарий."
    };
  }

  return { ok: true, scenario: response.data.scenario };
}

export async function publishBotScenario(
  scenario,
  { publishBotScenario: publishScenario = automationService.publishBotScenario } = {}
) {
  const scenarioId = String(scenario?.id ?? "").trim();
  if (!scenarioId) {
    return { ok: false, message: "Bot scenario id is required." };
  }

  const response = await publishScenario(scenario);
  if (response.status !== "ok" || !response.data?.runtimeVersion) {
    return {
      ok: false,
      message: response.error?.message ?? "Не удалось опубликовать сценарий."
    };
  }

  return {
    ok: true,
    auditId: response.data.auditId,
    runtimeVersion: response.data.runtimeVersion,
    scenarioId: response.data.scenarioId ?? scenarioId,
    versionState: response.data.versionState ?? "published"
  };
}

export async function runBotScenarioTest(
  scenario,
  { testBotScenario = automationService.testBotScenario } = {}
) {
  const scenarioId = String(scenario?.id ?? "").trim();
  if (!scenarioId) {
    return { ok: false, message: "Bot scenario id is required." };
  }

  const response = await testBotScenario(scenario);
  if (response.status !== "ok" || !response.data?.testRunId) {
    return {
      ok: false,
      message: response.error?.message ?? "Не удалось запустить тестовый прогон."
    };
  }

  return {
    ok: true,
    auditId: response.data.auditId,
    queue: response.data.queue,
    status: response.data.status,
    testRunId: response.data.testRunId
  };
}
