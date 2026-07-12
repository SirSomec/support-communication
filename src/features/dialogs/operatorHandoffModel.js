import { formatFallbackReasonLabel } from "../automation/automationModel.js";
import { maskPhone } from "../../app/dialogModel.js";

export function buildOperatorHandoffViewModel(handoff, context = {}) {
  if (!handoff || typeof handoff !== "object") return null;

  const canViewSensitive = Boolean(context.canViewSensitive);
  const phoneRaw = String(context.phone ?? handoff.phone ?? handoff.collectedFields?.phone ?? "").trim();
  const citations = Array.isArray(handoff.citations) ? handoff.citations : [];
  const fields = handoff.collectedFields && typeof handoff.collectedFields === "object"
    ? Object.entries(handoff.collectedFields)
      .filter(([key]) => key !== "phone")
      .map(([key, value]) => `${key}: ${value}`)
    : [];

  return {
    aiOutcome: String(handoff.aiOutcome ?? "").trim() || "Передача без AI-ответа",
    citationsLabel: citations.length
      ? citations.map((item) => `${item.title}${item.version != null ? ` v${item.version}` : ""}`).join(", ")
      : "",
    fieldsLabel: fields.join(" · "),
    goal: String(handoff.goal ?? handoff.scenarioName ?? "").trim() || "Сценарий бота",
    phone: phoneRaw ? (canViewSensitive ? phoneRaw : maskPhone(phoneRaw)) : "",
    queue: String(handoff.queue ?? "default"),
    reasonLabel: formatFallbackReasonLabel(handoff.reason),
    scenarioName: String(handoff.scenarioName ?? "Бот"),
    sessionState: String(handoff.sessionState ?? "").trim() || "Контекст диалога передан оператору",
    title: "Handoff summary",
    topic: String(context.topic ?? handoff.topic ?? "").trim()
  };
}
