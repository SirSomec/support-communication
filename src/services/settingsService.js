import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "settingsService";

export const settingsService = {
  async fetchEmployees(filters = {}) {
    return apiRequest("/settings/employees", {
      operation: "fetchEmployees",
      query: filters,
      service: SERVICE
    });
  },

  async inviteEmployee(payload = {}) {
    return apiRequest("/settings/employees/invites", {
      body: payload,
      method: "POST",
      operation: "inviteEmployee",
      service: SERVICE
    });
  },

  async updateEmployee({ employeeId, ...payload } = {}) {
    if (!hasRouteId(employeeId)) {
      return missingIdEnvelope("updateEmployee", "Employee id is required.");
    }

    return apiRequest(`/settings/employees/${encodeURIComponent(employeeId)}`, {
      body: payload,
      method: "PATCH",
      operation: "updateEmployee",
      service: SERVICE
    });
  },

  async resetEmployeePassword({ employeeId, ...payload } = {}) {
    if (!hasRouteId(employeeId)) {
      return missingIdEnvelope("resetEmployeePassword", "Employee id is required.");
    }

    return apiRequest(`/settings/employees/${encodeURIComponent(employeeId)}/password-reset`, {
      body: payload,
      method: "POST",
      operation: "resetEmployeePassword",
      service: SERVICE
    });
  },

  async resetEmployeeMfa({ employeeId, ...payload } = {}) {
    if (!hasRouteId(employeeId)) {
      return missingIdEnvelope("resetEmployeeMfa", "Employee id is required.");
    }

    return apiRequest(`/settings/employees/${encodeURIComponent(employeeId)}/mfa-reset`, {
      body: payload,
      method: "POST",
      operation: "resetEmployeeMfa",
      service: SERVICE
    });
  },

  async deactivateEmployee({ employeeId, ...payload } = {}) {
    if (!hasRouteId(employeeId)) {
      return missingIdEnvelope("deactivateEmployee", "Employee id is required.");
    }

    return apiRequest(`/settings/employees/${encodeURIComponent(employeeId)}/deactivate`, {
      body: payload,
      method: "POST",
      operation: "deactivateEmployee",
      service: SERVICE
    });
  },

  async fetchRoles() {
    return apiRequest("/settings/roles", {
      operation: "fetchRoles",
      service: SERVICE
    });
  },

  async fetchGroups() {
    return apiRequest("/settings/groups", {
      operation: "fetchGroups",
      service: SERVICE
    });
  },

  async createGroup(payload = {}) {
    return apiRequest("/settings/groups", {
      body: payload,
      method: "POST",
      operation: "createGroup",
      service: SERVICE
    });
  },

  async updateGroup({ groupId, ...payload } = {}) {
    if (!hasRouteId(groupId)) {
      return missingIdEnvelope("updateGroup", "Group id is required.");
    }

    return apiRequest(`/settings/groups/${encodeURIComponent(groupId)}`, {
      body: payload,
      method: "PATCH",
      operation: "updateGroup",
      service: SERVICE
    });
  },

  async fetchTopics(filters = {}) {
    return apiRequest("/workspace/topics", {
      operation: "fetchTopics",
      query: filters,
      service: SERVICE
    });
  },

  async createTopic(payload = {}) {
    return apiRequest("/workspace/topics", {
      body: payload,
      method: "POST",
      operation: "createTopic",
      service: SERVICE
    });
  },

  async updateTopic({ topicId, ...payload } = {}) {
    if (!hasRouteId(topicId)) {
      return missingIdEnvelope("updateTopic", "Topic id is required.");
    }

    return apiRequest(`/workspace/topics/${encodeURIComponent(topicId)}`, {
      body: payload,
      method: "PATCH",
      operation: "updateTopic",
      service: SERVICE
    });
  },

  async archiveTopic({ topicId, ...payload } = {}) {
    if (!hasRouteId(topicId)) {
      return missingIdEnvelope("archiveTopic", "Topic id is required.");
    }

    return apiRequest(`/workspace/topics/${encodeURIComponent(topicId)}/archive`, {
      body: payload,
      method: "POST",
      operation: "archiveTopic",
      service: SERVICE
    });
  },

  async restoreTopic({ topicId, ...payload } = {}) {
    if (!hasRouteId(topicId)) {
      return missingIdEnvelope("restoreTopic", "Topic id is required.");
    }

    return apiRequest(`/workspace/topics/${encodeURIComponent(topicId)}/restore`, {
      body: payload,
      method: "POST",
      operation: "restoreTopic",
      service: SERVICE
    });
  },

  async fetchTopicUsage(topicId) {
    if (!hasRouteId(topicId)) {
      return missingIdEnvelope("fetchTopicUsage", "Topic id is required.");
    }

    return apiRequest(`/workspace/topics/${encodeURIComponent(topicId)}/usage`, {
      operation: "fetchTopicUsage",
      service: SERVICE
    });
  },

  async fetchRules(filters = {}) {
    return apiRequest("/settings/rules", {
      operation: "fetchRules",
      query: filters,
      service: SERVICE
    });
  },

  async updateRule({ ruleId, ...payload } = {}) {
    if (!hasRouteId(ruleId)) {
      return missingIdEnvelope("updateRule", "Rule id is required.");
    }

    return apiRequest(`/settings/rules/${encodeURIComponent(ruleId)}`, {
      body: payload,
      method: "PATCH",
      operation: "updateRule",
      service: SERVICE
    });
  },

  async testRule({ ruleId, ...payload } = {}) {
    if (!hasRouteId(ruleId)) {
      return missingIdEnvelope("testRule", "Rule id is required.");
    }

    return apiRequest(`/settings/rules/${encodeURIComponent(ruleId)}/test`, {
      body: payload,
      method: "POST",
      operation: "testRule",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: [
        "fetchEmployees",
        "inviteEmployee",
        "updateEmployee",
        "resetEmployeePassword",
        "resetEmployeeMfa",
        "deactivateEmployee",
        "fetchRoles",
        "fetchGroups",
        "createGroup",
        "updateGroup",
        "fetchTopics",
        "createTopic",
        "updateTopic",
        "archiveTopic",
        "restoreTopic",
        "fetchTopicUsage",
        "fetchRules",
        "updateRule",
        "testRule"
      ],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};

function hasRouteId(value) {
  return String(value ?? "").trim().length > 0;
}

function missingIdEnvelope(operation, message) {
  return createApiErrorEnvelope({
    code: "missing_id",
    message,
    operation,
    service: SERVICE
  });
}
