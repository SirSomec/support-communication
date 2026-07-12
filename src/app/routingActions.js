import { routingService } from "../services/routingService.js";

export async function submitRoutingRedistribution(
  payload,
  {
    commitRedistribution = (commitPayload) => routingService.commitRedistribution(commitPayload)
  } = {}
) {
  const response = await commitRedistribution(payload);
  if (response.status !== "ok") {
    return {
      ok: false,
      message: response.error?.message ?? "Routing redistribution was rejected by backend."
    };
  }

  const data = response.data ?? {};
  const assignments = Array.isArray(data.appliedAssignments) ? data.appliedAssignments : [];
  if (!data.redistributionId || !data.auditEvent?.immutable || assignments.length === 0) {
    return {
      ok: false,
      message: "Routing redistribution response did not include backend redistribution evidence."
    };
  }

  return {
    ok: true,
    appliedCount: assignments.length,
    data,
    redistributionId: data.redistributionId
  };
}
