const LEGACY_NAME_PREFIX = "name:";
const UNATTRIBUTED_LABEL = "Без атрибуции";
const UNATTRIBUTED_DESCRIPTION = "Источник не подтвердил личность оператора; показатели сохранены отдельно и не используются для оценки сотрудника.";
const NAME_ONLY_DESCRIPTION = "Источник передал только имя без устойчивого ID; строка оставлена отдельно и не объединена с сотрудником автоматически.";
const GENERIC_OPERATOR_LABELS = new Set(["operator", "оператор", "unassigned", "unknown", "не назначен", "без атрибуции"]);

export function mergeReportOperatorRows(workloadRows, routingRows, options = {}) {
  const selectedOperatorId = cleanText(options.selectedOperatorId);
  const byId = new Map();

  for (const [index, row] of (Array.isArray(workloadRows) ? workloadRows : []).entries()) {
    if (!row || typeof row !== "object") continue;
    const id = workloadId(row, index);
    const operator = workloadOperator(row, id);
    const existing = byId.get(id);
    if (existing) fillMissingWorkload(existing, operator);
    else byId.set(id, operator);
  }

  for (const [index, row] of (Array.isArray(routingRows) ? routingRows : []).entries()) {
    if (!row || typeof row !== "object") continue;
    const id = cleanText(row.operatorId) ?? cleanText(row.key) ?? cleanText(row.id) ?? `routing:${index}`;
    const routingLabel = preferredOperatorLabel(row, id);
    const routingAvatar = operatorAvatar(row);
    const operator = byId.get(id) ?? emptyOperator(id, routingLabel, row.identityStatus, routingAvatar);
    improveOperatorLabel(operator, routingLabel);
    if (!operator.avatar && routingAvatar) operator.avatar = routingAvatar;
    if (normalizeIdentityStatus(row.identityStatus) === "unattributed") operator.unattributed = true;

    const transfers = routingTransferEvidence(row);
    if (!operator.transfers.measured && transfers.measured) operator.transfers = transfers;
    byId.set(id, operator);
  }

  return [...byId.values()]
    .map(finalizeOperator)
    .filter((row) => !selectedOperatorId || row.id === selectedOperatorId)
    .sort((a, b) => b.backlog - a.backlog
      || b.touches - a.touches
      || a.label.localeCompare(b.label, "ru")
      || a.id.localeCompare(b.id, "ru"));
}

function workloadId(row, index) {
  return cleanText(row.operatorId)
    ?? cleanText(row.key)
    ?? cleanText(row.id)
    ?? `workload:${index}`;
}

function workloadOperator(row, id) {
  const sourceLabel = preferredOperatorLabel(row, id);
  const nameOnly = !cleanText(row.operatorId) && id.toLocaleLowerCase("ru-RU").startsWith(LEGACY_NAME_PREFIX);
  return {
    avatar: operatorAvatar(row),
    backlog: metricEvidence(row, ["assignedBacklog", "backlog"]),
    firstResponse: metricEvidence(row, ["firstResponseMedianSeconds", "firstResponse"]),
    id,
    nameOnly,
    resolved: metricEvidence(row, ["resolved"]),
    sourceLabel,
    touches: metricEvidence(row, ["agentTouches", "touches"]),
    transfers: missingEvidence(),
    unattributed: normalizeIdentityStatus(row.identityStatus) === "unattributed"
      || (nameOnly && isGenericOperatorLabel(sourceLabel))
  };
}

function emptyOperator(id, sourceLabel, identityStatus, avatar = null) {
  return {
    avatar,
    backlog: missingEvidence(),
    firstResponse: missingEvidence(),
    id,
    nameOnly: false,
    resolved: missingEvidence(),
    sourceLabel,
    touches: missingEvidence(),
    transfers: missingEvidence(),
    unattributed: normalizeIdentityStatus(identityStatus) === "unattributed"
  };
}

function fillMissingWorkload(target, fallback) {
  for (const key of ["backlog", "firstResponse", "resolved", "touches"]) {
    if (!target[key].measured && fallback[key].measured) target[key] = fallback[key];
  }
  improveOperatorLabel(target, fallback.sourceLabel);
  if (!target.avatar && fallback.avatar) target.avatar = fallback.avatar;
  if (fallback.unattributed) target.unattributed = true;
}

function improveOperatorLabel(operator, candidate) {
  if (!candidate) return;
  const currentIsFallback = operator.sourceLabel === operator.id || isGenericOperatorLabel(operator.sourceLabel);
  if (currentIsFallback && !isGenericOperatorLabel(candidate) && candidate !== operator.id) {
    operator.sourceLabel = candidate;
  }
}

function finalizeOperator(operator) {
  const identityStatus = operator.unattributed
    ? "unattributed"
    : operator.nameOnly ? "name-only" : "canonical";
  return {
    avatar: operator.avatar ?? null,
    backlog: operator.backlog.measured ? operator.backlog.value : 0,
    firstResponse: operator.firstResponse.measured ? operator.firstResponse.value : null,
    id: operator.id,
    identityDescription: identityStatus === "unattributed"
      ? UNATTRIBUTED_DESCRIPTION
      : identityStatus === "name-only" ? NAME_ONLY_DESCRIPTION : null,
    identityStatus,
    label: identityStatus === "unattributed" ? UNATTRIBUTED_LABEL : operator.sourceLabel,
    resolved: operator.resolved.measured ? operator.resolved.value : 0,
    touches: operator.touches.measured ? operator.touches.value : 0,
    transfers: operator.transfers.measured ? operator.transfers.value : null
  };
}

function operatorAvatar(row) {
  const avatar = typeof row?.avatar === "string" ? row.avatar.trim() : "";
  return avatar || null;
}

function preferredOperatorLabel(row, id) {
  const candidates = [row.operatorName, row.label, row.name]
    .map(cleanText)
    .filter(Boolean);
  return candidates.find((label) => !isGenericOperatorLabel(label) && label !== id)
    ?? candidates[0]
    ?? id;
}

function routingTransferEvidence(row) {
  const direct = metricEvidence(row, ["transferEvents"]);
  if (direct.measured) return direct;
  const from = metricEvidence(row, ["transfersFrom"]);
  const to = metricEvidence(row, ["transfersTo"]);
  if (!from.measured && !to.measured) return missingEvidence();
  return measuredEvidence((from.measured ? from.value : 0) + (to.measured ? to.value : 0));
}

function metricEvidence(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined || value === "") continue;
    const normalized = Number(value);
    if (Number.isFinite(normalized)) return measuredEvidence(normalized);
  }
  return missingEvidence();
}

function measuredEvidence(value) {
  return { measured: true, value };
}

function missingEvidence() {
  return { measured: false, value: null };
}

function normalizeIdentityStatus(value) {
  return cleanText(value)?.toLocaleLowerCase("ru-RU") ?? "";
}

function normalizeOperatorLabel(value) {
  return cleanText(value)?.normalize("NFKC").toLocaleLowerCase("ru-RU") ?? "";
}

function isGenericOperatorLabel(value) {
  return GENERIC_OPERATOR_LABELS.has(normalizeOperatorLabel(value));
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}
