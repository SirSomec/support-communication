const channelResourceIds = new Set(["sdk", "telegram", "max", "vk"]);
const settingsTabs = new Set(["connections", "employees", "topics", "rules"]);
const serviceAdminAuditResourceIds = new Set(["service-admin-audit"]);

export function resolveNotificationNavigationTarget(actionTarget = {}) {
  const section = normalizeToken(actionTarget.section);
  const resourceId = normalizeToken(actionTarget.resourceId);

  if (!section) {
    return null;
  }

  if (section === "audit" && serviceAdminAuditResourceIds.has(resourceId)) {
    return {
      detail: {
        resourceId,
        screen: "service-admin",
        workspace: "audit"
      },
      namespace: "service-admin",
      section: "service-admin",
      view: "audit"
    };
  }

  if (section === "settings") {
    return {
      detail: resolveSettingsNavigationDetail(resourceId),
      namespace: "app",
      section,
      view: section
    };
  }

  if (section === "panel") {
    return {
      detail: resolvePanelNavigationDetail(resourceId),
      namespace: "app",
      section,
      view: section
    };
  }

  return {
    detail: resourceId ? { resourceId } : null,
    namespace: "app",
    section,
    view: section
  };
}

export function resolveNotificationActionAvailability(actionTarget = {}, { accessProfile = {}, conversationItems = [] } = {}) {
  if (actionTarget?.kind === "download") {
    return availableNotificationAction();
  }

  if (actionTarget?.kind !== "navigate") {
    return unavailableNotificationAction("Notification action is unavailable.");
  }

  const resolvedTarget = resolveNotificationNavigationTarget(actionTarget);
  if (!resolvedTarget) {
    return unavailableNotificationAction(accessProfile.reason || "Notification target is unavailable.");
  }

  if (resolvedTarget.namespace === "service-admin") {
    return accessProfile.canServiceAdmin
      ? availableNotificationAction()
      : unavailableNotificationAction("Service-admin access is required for this notification target.");
  }

  const sections = Array.isArray(accessProfile.sections) ? accessProfile.sections : [];
  if (!sections.includes(resolvedTarget.section)) {
    return unavailableNotificationAction(accessProfile.reason || "Notification target is unavailable.");
  }

  const resourceId = typeof resolvedTarget.detail?.resourceId === "string" ? resolvedTarget.detail.resourceId : "";
  if (resolvedTarget.section === "dialogs" && resourceId) {
    const hasConversation = Array.isArray(conversationItems)
      && conversationItems.some((conversation) => conversation?.id === resourceId);
    if (!hasConversation) {
      return unavailableNotificationAction("Notification dialog target was not found.");
    }
  }

  return availableNotificationAction();
}

export function resolvePanelNavigationDetail(resourceId = "") {
  const normalizedResourceId = normalizeToken(resourceId);
  const isTenantResource = normalizedResourceId.startsWith("tenant-");

  return {
    focus: "sla",
    resourceId: normalizedResourceId || undefined,
    screen: "panel",
    ...(isTenantResource ? { tenantId: normalizedResourceId } : {})
  };
}

export function resolveSettingsNavigationDetail(resourceId = "") {
  const normalizedResourceId = normalizeToken(resourceId);

  if (channelResourceIds.has(normalizedResourceId)) {
    return {
      channelType: normalizedResourceId,
      resourceId: normalizedResourceId,
      screen: "settings",
      tab: "connections"
    };
  }

  if (normalizedResourceId.startsWith("conn_")) {
    return {
      connectionId: normalizedResourceId,
      resourceId: normalizedResourceId,
      screen: "settings",
      tab: "connections"
    };
  }

  if (settingsTabs.has(normalizedResourceId)) {
    return {
      resourceId: normalizedResourceId,
      screen: "settings",
      tab: normalizedResourceId
    };
  }

  return {
    resourceId: normalizedResourceId || undefined,
    screen: "settings",
    tab: "connections"
  };
}

function normalizeToken(value) {
  return typeof value === "string" ? value.trim() : "";
}

function availableNotificationAction() {
  return {
    disabled: false,
    reason: ""
  };
}

function unavailableNotificationAction(reason) {
  return {
    disabled: true,
    reason
  };
}
