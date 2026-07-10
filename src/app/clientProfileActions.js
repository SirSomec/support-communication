import { clientService } from "../services/clientService.js";

export async function submitClientMerge(
  { candidate, primary },
  {
    mergeClientProfiles = (payload) => clientService.mergeClientProfiles(payload)
  } = {}
) {
  const response = await mergeClientProfiles({ candidate, primary });
  if (response.status !== "ok") {
    return mutationError(response, "Client profile merge was rejected by the backend.");
  }

  const data = response.data ?? {};
  const backendCandidateId = stringValue(data.mergedProfileId ?? data.sourceProfileIds?.[1]);
  if (!backendCandidateId) {
    return mutationError(
      { error: { message: "Client profile merge response did not include backend merge evidence." } },
      "Client profile merge response did not include backend merge evidence."
    );
  }

  return {
    ok: true,
    candidateId: backendCandidateId,
    data
  };
}

export async function submitClientUnmerge(
  { candidate, primary },
  {
    unmergeClientProfile = (payload) => clientService.unmergeClientProfile(payload)
  } = {}
) {
  const response = await unmergeClientProfile({ candidate, primary });
  if (response.status !== "ok") {
    return mutationError(response, "Client profile unmerge was rejected by the backend.");
  }

  const data = response.data ?? {};
  const backendCandidateId = stringValue(data.detachedProfileId);
  if (!backendCandidateId) {
    return mutationError(
      { error: { message: "Client profile unmerge response did not include backend detach evidence." } },
      "Client profile unmerge response did not include backend detach evidence."
    );
  }

  return {
    ok: true,
    candidateId: backendCandidateId,
    data
  };
}

export async function submitClientExport(
  payload,
  {
    createClientExport = (exportPayload) => clientService.createClientExport(exportPayload)
  } = {}
) {
  const response = await createClientExport(payload);
  if (response.status !== "ok") {
    return mutationError(response, "Client export was rejected by the backend.");
  }

  const data = response.data ?? {};
  const exportId = stringValue(data.exportId);
  const fileName = stringValue(data.fileDescriptor?.fileName);
  const auditEvent = data.auditEvent;
  if (!exportId || !fileName || auditEvent?.immutable !== true) {
    return mutationError(
      { error: { message: "Client export response did not include backend export descriptor evidence." } },
      "Client export response did not include backend export descriptor evidence."
    );
  }

  return {
    ok: true,
    data,
    exportId,
    fileName
  };
}

function mutationError(response, fallback) {
  return {
    ok: false,
    message: response.error?.message ?? fallback
  };
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
