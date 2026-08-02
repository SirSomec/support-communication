import { createEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { QueueDirectoryRepository, QueueDirectoryRepositoryError } from "./queue-directory.repository.js";
const SERVICE = "queueDirectoryService";
const supportedStatuses = new Set(["active", "inactive"]);
export class QueueDirectoryService {
    repository;
    constructor(repository = new QueueDirectoryRepository()) {
        this.repository = repository;
    }
    async fetchQueues(filters = {}, context = {}) {
        const tenantId = normalizeRequired(context.tenantId);
        if (!tenantId) {
            return failure("fetchQueues", "invalid", "tenant_context_required", "Tenant context is required.", {});
        }
        const status = normalizeOptionalStatus(filters.status);
        if (filters.status && !status) {
            return failure("fetchQueues", "invalid", "queue_status_unsupported", "Queue status is not supported.", {
                status: filters.status
            });
        }
        const queues = await this.repository.listQueues(tenantId, status);
        return success("fetchQueues", { queues, total: queues.length }, { status: status ?? "all", tenantId });
    }
    async createQueue(payload = {}, context = {}) {
        const operation = "createQueue";
        const tenantId = normalizeRequired(context.tenantId);
        if (!tenantId) {
            return failure(operation, "invalid", "tenant_context_required", "Tenant context is required.", {});
        }
        const name = normalizeRequired(payload.name);
        if (!name || name.length > 120) {
            return failure(operation, "invalid", "queue_name_invalid", "Queue name must contain between 1 and 120 characters.", {});
        }
        const id = normalizeOptionalId(payload.id);
        if (payload.id !== undefined && !id) {
            return failure(operation, "invalid", "queue_id_invalid", "Queue identifier has an unsupported format.", {});
        }
        const status = payload.status === undefined ? "active" : normalizeOptionalStatus(payload.status);
        if (!status) {
            return failure(operation, "invalid", "queue_status_unsupported", "Queue status is not supported.", { status: payload.status });
        }
        const defaultTeamId = normalizeNullableId(payload.defaultTeamId);
        if (payload.defaultTeamId !== undefined && payload.defaultTeamId !== null && !defaultTeamId) {
            return failure(operation, "invalid", "default_team_id_invalid", "Default team identifier has an unsupported format.", {});
        }
        const memberIds = normalizeMemberIds(payload.memberIds);
        if (payload.memberIds !== undefined && !memberIds) {
            return failure(operation, "invalid", "queue_member_ids_invalid", "Queue members must be a list of valid operator identifiers.", {});
        }
        try {
            const queue = await this.repository.createQueue({ defaultTeamId, id, memberIds: memberIds ?? [], name, status, tenantId });
            return success(operation, { queue }, { tenantId });
        }
        catch (error) {
            return repositoryFailure(operation, error, { queueId: id ?? null, tenantId });
        }
    }
    async updateQueue(queueId, payload = {}, context = {}) {
        const operation = "updateQueue";
        const tenantId = normalizeRequired(context.tenantId);
        if (!tenantId) {
            return failure(operation, "invalid", "tenant_context_required", "Tenant context is required.", {});
        }
        const normalizedQueueId = normalizeOptionalId(queueId ?? payload.queueId);
        if (!normalizedQueueId) {
            return failure(operation, "invalid", "queue_id_invalid", "Queue identifier is required.", {});
        }
        const hasName = payload.name !== undefined;
        const name = hasName ? normalizeRequired(payload.name) : undefined;
        if (hasName && (!name || name.length > 120)) {
            return failure(operation, "invalid", "queue_name_invalid", "Queue name must contain between 1 and 120 characters.", {});
        }
        const hasStatus = payload.status !== undefined;
        const status = hasStatus ? normalizeOptionalStatus(payload.status) : undefined;
        if (hasStatus && !status) {
            return failure(operation, "invalid", "queue_status_unsupported", "Queue status is not supported.", { status: payload.status });
        }
        const hasDefaultTeam = Object.prototype.hasOwnProperty.call(payload, "defaultTeamId");
        const hasMembers = Object.prototype.hasOwnProperty.call(payload, "memberIds");
        const memberIds = hasMembers ? normalizeMemberIds(payload.memberIds) : undefined;
        if (hasMembers && !memberIds) {
            return failure(operation, "invalid", "queue_member_ids_invalid", "Queue members must be a list of valid operator identifiers.", {});
        }
        const defaultTeamId = hasDefaultTeam ? normalizeNullableId(payload.defaultTeamId) : undefined;
        if (hasDefaultTeam && payload.defaultTeamId !== null && !defaultTeamId) {
            return failure(operation, "invalid", "default_team_id_invalid", "Default team identifier has an unsupported format.", {});
        }
        if (!hasName && !hasStatus && !hasDefaultTeam && !hasMembers) {
            return failure(operation, "invalid", "queue_update_empty", "At least one queue field must be provided.", {});
        }
        try {
            const queue = await this.repository.updateQueue({
                ...(hasDefaultTeam ? { defaultTeamId } : {}),
                ...(hasName ? { name } : {}),
                ...(hasMembers ? { memberIds } : {}),
                queueId: normalizedQueueId,
                ...(hasStatus ? { status } : {}),
                tenantId
            });
            return success(operation, { queue }, { tenantId });
        }
        catch (error) {
            return repositoryFailure(operation, error, { queueId: normalizedQueueId, tenantId });
        }
    }
}
function repositoryFailure(operation, error, data) {
    if (!(error instanceof QueueDirectoryRepositoryError)) {
        throw error;
    }
    const status = error.code === "queue_not_found" || error.code === "default_team_not_found"
        ? "not_found"
        : "conflict";
    return failure(operation, status, error.code, error.message, { ...data, ...error.details });
}
function success(operation, data, meta) {
    return createEnvelope({ data, meta: { source: "postgres", ...meta }, operation, service: SERVICE, traceId: traceId(operation) });
}
function failure(operation, status, code, message, data) {
    return createEnvelope({ data, error: { code, message }, meta: { source: "postgres" }, operation, service: SERVICE, status, traceId: traceId(operation) });
}
function normalizeOptionalStatus(value) {
    const status = String(value ?? "").trim().toLowerCase();
    return supportedStatuses.has(status) ? status : undefined;
}
function normalizeRequired(value) {
    const normalized = String(value ?? "").trim();
    return normalized || undefined;
}
function normalizeOptionalId(value) {
    const normalized = normalizeRequired(value);
    return normalized && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(normalized) ? normalized : undefined;
}
function normalizeNullableId(value) {
    if (value === null || value === "") {
        return null;
    }
    return normalizeOptionalId(value);
}
function normalizeMemberIds(value) {
    if (!Array.isArray(value))
        return undefined;
    const ids = Array.from(new Set(value.map(normalizeOptionalId)));
    return ids.every(Boolean) ? ids : undefined;
}
function traceId(operation) {
    return getCurrentTraceId() ?? createRequestTraceId(`queue-directory:${operation}`);
}
//# sourceMappingURL=queue-directory.service.js.map