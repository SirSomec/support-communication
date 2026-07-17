import { automationService } from "../services/automationService.js";

export function buildBotScenarioUpdatePatch(scenarioId, fields = {}) {
  return {
    id: String(scenarioId ?? "").trim(),
    ...fields
  };
}

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
    preview: response.data.preview ?? null,
    status: response.data.status,
    testRunId: response.data.testRunId
  };
}

export async function rollbackBotScenario(
  scenarioId,
  versionId,
  { rollbackBotScenario: rollback = automationService.rollbackBotScenario } = {}
) {
  const id = String(scenarioId ?? "").trim();
  const version = String(versionId ?? "").trim();
  if (!id || !version) return { ok: false, message: "Нужны идентификаторы сценария и версии." };

  const response = await rollback(id, version);
  if (response.status !== "ok" || !response.data?.scenario) {
    return { ok: false, message: response.error?.message ?? "Не удалось выполнить откат версии." };
  }
  return { ok: true, scenario: response.data.scenario, versionId: response.data.versionId };
}

export async function discardBotScenarioDraft(
  scenarioId,
  { discardBotScenarioDraft: discard = automationService.discardBotScenarioDraft } = {}
) {
  const id = String(scenarioId ?? "").trim();
  if (!id) return { ok: false, message: "Bot scenario id is required." };

  const response = await discard(id);
  if (response.status !== "ok" || !response.data?.scenario) {
    return { ok: false, message: response.error?.message ?? "Не удалось отменить черновик." };
  }
  return { discarded: response.data.discarded === true, ok: true, scenario: response.data.scenario };
}

export async function changeBotScenarioLifecycle(
  scenarioId,
  action,
  dependencies = {},
  options = {}
) {
  const id = String(scenarioId ?? "").trim();
  if (!id) return { ok: false, message: "Bot scenario id is required." };

  const operations = {
    archive: dependencies.archiveBotScenario ?? automationService.archiveBotScenario,
    disable: dependencies.disableBotScenario ?? automationService.disableBotScenario,
    restore: dependencies.restoreBotScenario ?? automationService.restoreBotScenario
  };
  const operation = operations[action];
  if (!operation) return { ok: false, message: "Unsupported scenario lifecycle action." };

  const response = await operation(id, options);
  if (response.status !== "ok" || !response.data?.scenario) {
    return { ok: false, message: response.error?.message ?? "Не удалось изменить состояние сценария." };
  }

  return {
    duplicate: response.data.duplicate === true,
    ok: true,
    scenario: response.data.scenario
  };
}
