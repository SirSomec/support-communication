export function mergeReportOperatorRows(workloadRows, routingRows, options = {}) {
  const selectedOperatorId = options.selectedOperatorId ? String(options.selectedOperatorId) : null;
  const byId = new Map();

  for (const [index, row] of (Array.isArray(workloadRows) ? workloadRows : []).entries()) {
    const id = String(row.key ?? row.operatorId ?? row.id ?? index);
    byId.set(id, {
      backlog: number(row.assignedBacklog ?? row.backlog),
      firstResponse: finite(row.firstResponseMedianSeconds),
      id,
      label: String(row.label ?? row.operatorName ?? row.operatorId ?? id),
      resolved: number(row.resolved),
      touches: number(row.agentTouches),
      transfers: null
    });
  }

  for (const [index, row] of (Array.isArray(routingRows) ? routingRows : []).entries()) {
    const id = String(row.operatorId ?? row.id ?? index);
    const matchedWorkload = byId.get(id);
    const operator = matchedWorkload ?? {
      backlog: 0,
      firstResponse: null,
      id,
      label: String(row.operatorName ?? row.operatorId ?? id),
      resolved: 0,
      touches: 0,
      transfers: null
    };
    operator.transfers = number(row.transferEvents ?? (number(row.transfersFrom) + number(row.transfersTo)));
    if (!operator.label || operator.label === id) operator.label = String(row.operatorName ?? row.operatorId ?? id);
    byId.set(id, operator);
  }

  return [...byId.values()]
    .filter((row) => !selectedOperatorId || row.id === selectedOperatorId)
    .sort((a, b) => b.backlog - a.backlog || b.touches - a.touches || a.label.localeCompare(b.label, "ru"));
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function finite(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
}
