import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("UI mutation guards", () => {
  it("passes tenant MFA challenge id when completing two-factor login", () => {
    const source = readFileSync(new URL("../src/features/auth/AuthPage.jsx", import.meta.url), "utf8");

    assert.match(source, /tenantMfaChallengeId/);
    assert.match(source, /response\.data\?\.nextStep === "otp"/);
    assert.match(source, /const challengeId = response\.data\?\.mfaChallengeId \?\? tenantMfaChallengeId/);
    assert.match(source, /setTenantMfaChallengeId\(challengeId\)/);
    assert.match(source, /mfaChallengeId:\s*tenantMfaChallengeId/);
  });

  it("keeps email OTP challenge state and exposes the local test mailbox", () => {
    const source = readFileSync(new URL("../src/features/auth/AuthPage.jsx", import.meta.url), "utf8");
    const model = readFileSync(new URL("../src/features/auth/authModel.js", import.meta.url), "utf8");

    assert.match(source, /response\.data\?\.mfaChallengeId \?\? tenantMfaChallengeId/);
    assert.match(source, /Код подтверждения отправлен на \$\{contextEmail\}/);
    assert.match(source, /autoComplete="one-time-code"/);
    assert.match(source, /Открыть тестовую почту/);
    assert.match(model, /код, отправленный на email/);
    assert.doesNotMatch(source, /из приложения 2FA/);
    assert.doesNotMatch(source, /placeholder="123456"/);
  });

  it("continues invite and recovery MFA with their source-specific endpoints", () => {
    const source = readFileSync(new URL("../src/features/auth/AuthPage.jsx", import.meta.url), "utf8");

    assert.match(source, /tenantMfaContext/);
    assert.match(source, /method:\s*"invite"/);
    assert.match(source, /method:\s*"recovery"/);
    assert.match(source, /authService\.acceptInvite\(\{[\s\S]*mfaChallengeId:\s*tenantMfaChallengeId[\s\S]*otp:\s*twoFactorCode/);
    assert.match(source, /authService\.completeRecovery\(\{[\s\S]*mfaChallengeId:\s*tenantMfaChallengeId[\s\S]*otp:\s*twoFactorCode/);
  });

  it("passes selected tenant id through organization selection login and MFA", () => {
    const source = readFileSync(new URL("../src/features/auth/AuthPage.jsx", import.meta.url), "utf8");

    assert.match(source, /tenantId:\s*selectedOrganization\.tenantId \?\? selectedOrganization\.id/);
    assert.match(source, /tenantId:\s*context\.tenantId \|\| undefined/);
  });

  it("uses report export download bytes instead of descriptor-only toast", () => {
    const source = readFileSync(new URL("../src/features/reports/ReportsScreen.jsx", import.meta.url), "utf8");

    assert.match(source, /reportService\.downloadExportFile\(job\)/);
    assert.match(source, /URL\.createObjectURL\(response\.data\.blob\)/);
    assert.match(source, /link\.download = response\.data\.fileName/);
    assert.match(source, /link\.click\(\)/);
    assert.match(source, /URL\.revokeObjectURL\(url\)/);
  });

  it("preserves notification action targets for real notification actions", async () => {
    const { mapNotificationItems } = await import("../src/app/notificationModel.js");

    const [notification] = mapNotificationItems([{
      action: "Download",
      actionTarget: {
        fileName: "export-2418.xlsx",
        format: "XLSX",
        jobId: "export-2418",
        kind: "download",
        service: "reports"
      },
      id: "notif-export-ready",
      title: "Export ready",
      type: "Export",
      typeKey: "export"
    }]);

    assert.deepEqual(notification.actionTarget, {
      fileName: "export-2418.xlsx",
      format: "XLSX",
      jobId: "export-2418",
      kind: "download",
      service: "reports"
    });
  });

  it("downloads report exports from notification actions before marking them read", () => {
    const source = readFileSync(new URL("../src/features/notifications/NotificationCenter.jsx", import.meta.url), "utf8");

    assert.match(source, /reportService\.downloadExportFile/);
    assert.match(source, /actionTarget\?\.kind === "download"/);
    assert.match(source, /actionTarget\?\.service === "reports"/);
    assert.match(source, /notificationService\.markNotificationsRead/);
    assert.ok(
      source.indexOf("reportService.downloadExportFile") < source.indexOf("notificationService.markNotificationsRead"),
      "download must be attempted before the notification is marked read"
    );
  });

  it("executes notification navigation targets before marking them read", () => {
    const source = readFileSync(new URL("../src/features/notifications/NotificationCenter.jsx", import.meta.url), "utf8");
    const shellSource = readFileSync(new URL("../src/features/app-shell/AppShell.jsx", import.meta.url), "utf8");
    const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

    assert.match(source, /onNavigateNotificationAction/);
    assert.match(source, /actionTarget\?\.kind === "navigate"/);
    assert.match(source, /onNavigateNotificationAction\(actionTarget, item\)/);
    assert.ok(
      source.indexOf("onNavigateNotificationAction(actionTarget, item)") < source.indexOf("notificationService.markNotificationsRead"),
      "navigation must be attempted before the notification is marked read"
    );
    assert.doesNotMatch(source, /return\s*\{\s*ok:\s*true,\s*message:\s*`\$\{item\.type\}: \$\{item\.action\}`/);
    assert.match(shellSource, /onNavigateNotificationAction/);
    assert.match(appSource, /handleNotificationNavigation/);
  });

  it("resolves notification deep links to concrete product workspaces", async () => {
    const { resolveNotificationNavigationTarget } = await import("../src/app/notificationNavigation.js");

    assert.deepEqual(resolveNotificationNavigationTarget({
      kind: "navigate",
      section: "settings",
      resourceId: "vk"
    }), {
      detail: {
        channelType: "vk",
        resourceId: "vk",
        screen: "settings",
        tab: "connections"
      },
      namespace: "app",
      section: "settings",
      view: "settings"
    });

    assert.deepEqual(resolveNotificationNavigationTarget({
      kind: "navigate",
      section: "audit",
      resourceId: "service-admin-audit"
    }), {
      detail: {
        resourceId: "service-admin-audit",
        screen: "service-admin",
        workspace: "audit"
      },
      namespace: "service-admin",
      section: "service-admin",
      view: "audit"
    });

    assert.deepEqual(resolveNotificationNavigationTarget({
      kind: "navigate",
      section: "panel",
      resourceId: "tenant-ladoga"
    }), {
      detail: {
        focus: "sla",
        resourceId: "tenant-ladoga",
        screen: "panel",
        tenantId: "tenant-ladoga"
      },
      namespace: "app",
      section: "panel",
      view: "panel"
    });
  });

  it("wires notification navigation detail into concrete screens", () => {
    const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    const routerSource = readFileSync(new URL("../src/features/section-router.jsx", import.meta.url), "utf8");
    const panelSource = readFileSync(new URL("../src/features/panel/PanelScreen.jsx", import.meta.url), "utf8");
    const settingsSource = readFileSync(new URL("../src/features/settings/SettingsScreen.jsx", import.meta.url), "utf8");
    const channelsSource = readFileSync(new URL("../src/features/settings/ChannelConnectionsPanel.jsx", import.meta.url), "utf8");

    assert.match(appSource, /resolveNotificationNavigationTarget/);
    assert.match(appSource, /notificationNavigationTarget/);
    assert.doesNotMatch(appSource, /routeActions\.openServiceAdmin/);
    assert.doesNotMatch(appSource, /ServiceAdminDashboard/);
    assert.doesNotMatch(appSource, /VITE_ENABLE_SERVICE_ADMIN/);
    assert.match(routerSource, /navigationTarget/);
    assert.match(panelSource, /navigationTarget/);
    assert.match(panelSource, /panelNotificationContext/);
    assert.match(panelSource, /data-testid="panel-notification-context"/);
    assert.match(settingsSource, /navigationTarget/);
    assert.match(settingsSource, /focusChannelType/);
    assert.match(channelsSource, /focusChannelType/);
    assert.match(channelsSource, /consumedFocusRef\.current === focusNavigationKey/);
    assert.match(channelsSource, /consumedFocusRef\.current = focusNavigationKey/);
  });

  it("guards service-admin notification actions before rendering tenant-shell buttons", async () => {
    const { resolveNotificationActionAvailability } = await import("../src/app/notificationNavigation.js");
    const source = readFileSync(new URL("../src/features/notifications/NotificationCenter.jsx", import.meta.url), "utf8");
    const shellSource = readFileSync(new URL("../src/features/app-shell/AppShell.jsx", import.meta.url), "utf8");
    const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

    const serviceAdminTarget = {
      kind: "navigate",
      section: "audit",
      resourceId: "service-admin-audit"
    };

    assert.deepEqual(resolveNotificationActionAvailability(serviceAdminTarget, {
      accessProfile: {
        canServiceAdmin: false,
        reason: "Tenant shell access",
        sections: ["audit"]
      }
    }), {
      disabled: true,
      reason: "Откройте /service-admin — этот раздел недоступен из рабочего места организации."
    });

    assert.deepEqual(resolveNotificationActionAvailability(serviceAdminTarget, {
      accessProfile: {
        canServiceAdmin: true,
        sections: []
      }
    }), {
      disabled: true,
      reason: "Откройте /service-admin — этот раздел недоступен из рабочего места организации."
    });

    assert.deepEqual(resolveNotificationActionAvailability({
      kind: "download",
      service: "reports",
      jobId: "export-2418"
    }), {
      disabled: false,
      reason: ""
    });

    assert.match(source, /getNotificationActionAvailability/);
    assert.match(source, /disabled=\{notificationActionState\.disabled\}/);
    assert.match(source, /notification-action-note/);
    assert.match(shellSource, /getNotificationActionAvailability/);
    assert.doesNotMatch(shellSource, /service-admin-entry/);
    assert.match(appSource, /resolveNotificationActionAvailability/);
  });

  it("does not report client merge success when backend rejects the mutation", async () => {
    const { submitClientMerge } = await import("../src/app/clientProfileActions.js");
    const result = await submitClientMerge(
      {
        candidate: { id: "candidate" },
        primary: { id: "primary" }
      },
      {
        mergeClientProfiles: async () => ({
          status: "invalid",
          error: { message: "reason is required" }
        })
      }
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /reason is required/);
    assert.equal(result.candidateId, undefined);
  });

  it("uses backend merge evidence before reporting client merge success", async () => {
    const { submitClientMerge } = await import("../src/app/clientProfileActions.js");
    const result = await submitClientMerge(
      {
        candidate: { id: "local-candidate" },
        primary: { id: "local-primary" }
      },
      {
        mergeClientProfiles: async () => ({
          status: "ok",
          data: {
            auditEvent: { id: "evt_client_merge_backend" },
            mergedProfileId: "src_backend_candidate"
          }
        })
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.candidateId, "src_backend_candidate");
  });

  it("does not report client merge success without backend merge evidence", async () => {
    const { submitClientMerge } = await import("../src/app/clientProfileActions.js");
    const result = await submitClientMerge(
      {
        candidate: { id: "local-candidate" },
        primary: { id: "local-primary" }
      },
      {
        mergeClientProfiles: async () => ({
          status: "ok",
          data: {
            auditEvent: { id: "evt_client_merge_missing_evidence" }
          }
        })
      }
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /подтверждения объединения/);
  });

  it("does not report client unmerge success when backend rejects the mutation", async () => {
    const { submitClientUnmerge } = await import("../src/app/clientProfileActions.js");
    const result = await submitClientUnmerge(
      {
        candidate: { id: "candidate" },
        primary: { id: "primary" }
      },
      {
        unmergeClientProfile: async () => ({
          status: "conflict",
          error: { message: "profile merge event was already changed" }
        })
      }
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /already changed/);
    assert.equal(result.candidateId, undefined);
  });

  it("uses backend detach evidence before reporting client unmerge success", async () => {
    const { submitClientUnmerge } = await import("../src/app/clientProfileActions.js");
    const result = await submitClientUnmerge(
      {
        candidate: { id: "local-candidate" },
        primary: { id: "local-primary" }
      },
      {
        unmergeClientProfile: async () => ({
          status: "ok",
          data: {
            auditEvent: { id: "evt_client_unmerge_backend" },
            detachedProfileId: "src_backend_detached"
          }
        })
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.candidateId, "src_backend_detached");
  });

  it("uses backend export descriptor evidence before reporting client export success", async () => {
    const { submitClientExport } = await import("../src/app/clientProfileActions.js");
    const result = await submitClientExport(
      {
        reason: "Export selected client segment",
        segmentId: "channel:SDK"
      },
      {
        createClientExport: async () => ({
          status: "ok",
          data: {
            auditEvent: { id: "evt_client_export_backend", immutable: true },
            exportId: "client_export_backend",
            fileDescriptor: { fileName: "clients-channel-sdk.json", format: "json" },
            itemCount: 2,
            status: "queued"
          }
        })
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.exportId, "client_export_backend");
    assert.equal(result.fileName, "clients-channel-sdk.json");
  });

  it("does not report client export success without backend export evidence", async () => {
    const { submitClientExport } = await import("../src/app/clientProfileActions.js");
    const result = await submitClientExport(
      {
        reason: "Export selected client segment",
        segmentId: "channel:SDK"
      },
      {
        createClientExport: async () => ({
          status: "ok",
          data: {
            exportId: "client_export_missing_audit",
            fileDescriptor: { fileName: "clients.json" }
          }
        })
      }
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /дескриптора экспорта/);
  });

  it("uses backend redistribution evidence before reporting routing success", async () => {
    const { submitRoutingRedistribution } = await import("../src/app/routingActions.js");
    const result = await submitRoutingRedistribution(
      {
        idempotencyKey: "redistribution-ui-test",
        reason: "Rebalance high SLA risk queue",
        selectedQueues: ["VK"]
      },
      {
        commitRedistribution: async () => ({
          status: "ok",
          data: {
            appliedAssignments: [{ conversationId: "alexey", targetOperatorId: "operator-anna" }],
            auditEvent: { id: "evt_routing_redistribution", immutable: true },
            redistributionId: "routing_redist_backend",
            status: "committed"
          }
        })
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.redistributionId, "routing_redist_backend");
    assert.equal(result.appliedCount, 1);
  });

  it("does not report routing redistribution success without backend evidence", async () => {
    const { submitRoutingRedistribution } = await import("../src/app/routingActions.js");
    const result = await submitRoutingRedistribution(
      {
        idempotencyKey: "redistribution-ui-test",
        reason: "Rebalance high SLA risk queue",
        selectedQueues: ["VK"]
      },
      {
        commitRedistribution: async () => ({
          status: "ok",
          data: {
            redistributionId: "routing_redist_missing_audit"
          }
        })
      }
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /подтверждения перераспределения/);
  });

  it("keeps notification read state unchanged when mark-read fails", async () => {
    const { applyNotificationMarkReadResponse } = await import("../src/app/notificationActions.js");
    const result = applyNotificationMarkReadResponse({
      currentReadIds: ["already-read"],
      fallbackIds: ["notif-failed"],
      response: {
        status: "invalid",
        error: { message: "tenant id required" }
      }
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.ids, ["already-read"]);
    assert.match(result.message, /tenant id required/);
  });

  it("uses backend mark-read evidence before updating notification read state", async () => {
    const { applyNotificationMarkReadResponse } = await import("../src/app/notificationActions.js");
    const result = applyNotificationMarkReadResponse({
      currentReadIds: ["already-read"],
      fallbackIds: ["fallback-id"],
      response: {
        status: "ok",
        data: {
          items: [{ id: "notif-backend", readAt: "2026-07-02T12:00:00.000Z" }]
        }
      }
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.ids, ["already-read", "notif-backend"]);
  });

  it("does not use fallback ids when mark-read success lacks backend items", async () => {
    const { applyNotificationMarkReadResponse } = await import("../src/app/notificationActions.js");
    const result = applyNotificationMarkReadResponse({
      currentReadIds: ["already-read"],
      fallbackIds: ["fallback-id"],
      response: {
        status: "ok",
        data: {
          readCount: 1
        }
      }
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.ids, ["already-read"]);
    assert.match(result.message, /не подтверждена бэкендом/);
  });

  it("treats zero-read mark-read success as an idempotent already-read confirmation", async () => {
    const { applyNotificationMarkReadResponse } = await import("../src/app/notificationActions.js");
    const result = applyNotificationMarkReadResponse({
      currentReadIds: ["already-read"],
      fallbackIds: ["notif-export-ready"],
      response: {
        status: "ok",
        data: {
          items: [],
          readCount: 0
        }
      }
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.ids, ["already-read", "notif-export-ready"]);
  });

  it("uses backend preference evidence before updating notification delivery state", async () => {
    const { applyNotificationPreferencesResponse } = await import("../src/app/notificationActions.js");
    assert.equal(typeof applyNotificationPreferencesResponse, "function");

    const result = applyNotificationPreferencesResponse({
      currentPreferences: { mutedTypeKeys: [] },
      response: {
        status: "ok",
        data: {
          preferences: {
            mutedTypeKeys: ["channel"],
            browserPushEnabled: true,
            mutedSoundRuleIds: ["sound-mention"],
            enabledExternalChannelIds: ["email-digest"]
          },
          auditEvent: { id: "notif_pref_backend", immutable: true }
        }
      }
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.preferences.mutedTypeKeys, ["channel"]);
    assert.equal(result.preferences.browserPushEnabled, true);
  });

  it("keeps notification delivery state unchanged without preference audit evidence", async () => {
    const { applyNotificationPreferencesResponse } = await import("../src/app/notificationActions.js");
    assert.equal(typeof applyNotificationPreferencesResponse, "function");

    const result = applyNotificationPreferencesResponse({
      currentPreferences: { mutedTypeKeys: [] },
      response: {
        status: "ok",
        data: {
          preferences: {
            mutedTypeKeys: ["channel"],
            browserPushEnabled: true
          }
        }
      }
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.preferences, { mutedTypeKeys: [] });
    assert.match(result.message, /настроек уведомлений не подтверждено/);
  });

  it("requires backend delivery evidence before reporting critical alert test success", async () => {
    const { applyCriticalAlertTestResponse } = await import("../src/app/notificationActions.js");
    assert.equal(typeof applyCriticalAlertTestResponse, "function");

    const result = applyCriticalAlertTestResponse({
      response: {
        status: "ok",
        data: {
          notification: { id: "notif-critical", typeKey: "critical" },
          deliveryResults: [{ channelId: "email-digest", status: "queued" }],
          auditEvent: { id: "notif_test_backend", immutable: true }
        }
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.deliveredCount, 1);
  });

  it("requires backend push subscription evidence before reporting browser push enabled", async () => {
    const { applyBrowserPushSubscriptionResponse } = await import("../src/app/notificationActions.js");
    assert.equal(typeof applyBrowserPushSubscriptionResponse, "function");

    const result = applyBrowserPushSubscriptionResponse({
      currentPreferences: { browserPushEnabled: false },
      response: {
        status: "ok",
        data: {
          auditEvent: { id: "notif_push_backend", immutable: true },
          preferences: {
            browserPushEnabled: true,
            browserPushSubscriptionId: "push_sub_backend"
          },
          subscription: {
            endpointHash: "sha256:abc123",
            id: "push_sub_backend",
            status: "active"
          }
        }
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.preferences.browserPushEnabled, true);
    assert.equal(result.preferences.browserPushSubscriptionId, "push_sub_backend");
    assert.equal(result.subscription.id, "push_sub_backend");
  });

  it("does not enable browser push without immutable subscription audit evidence", async () => {
    const { applyBrowserPushSubscriptionResponse } = await import("../src/app/notificationActions.js");
    assert.equal(typeof applyBrowserPushSubscriptionResponse, "function");

    const result = applyBrowserPushSubscriptionResponse({
      currentPreferences: { browserPushEnabled: false },
      response: {
        status: "ok",
        data: {
          preferences: {
            browserPushEnabled: true,
            browserPushSubscriptionId: "push_sub_missing_audit"
          },
          subscription: {
            endpointHash: "sha256:abc123",
            id: "push_sub_missing_audit",
            status: "active"
          }
        }
      }
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.preferences, { browserPushEnabled: false });
    assert.match(result.message, /push-уведомления браузера не подтверждена/);
  });

  it("normalizes notification delivery channels from active tenant channel connections", async () => {
    const { normalizeNotificationDeliveryChannels } = await import("../src/app/notificationActions.js");
    assert.equal(typeof normalizeNotificationDeliveryChannels, "function");

    const channels = normalizeNotificationDeliveryChannels({
      status: "ok",
      data: {
        connections: [
          {
            environment: "production",
            id: "conn_admin_telegram",
            name: "Admin Telegram",
            status: "active",
            type: "telegram"
          },
          {
            environment: "production",
            id: "conn_disabled",
            name: "Disabled",
            status: "disabled",
            type: "telegram"
          },
          {
            environment: "production",
            id: "",
            name: "Missing id",
            status: "active",
            type: "webhook"
          }
        ]
      }
    });

    assert.deepEqual(channels, [
      {
        detail: "telegram · production",
        id: "conn_admin_telegram",
        label: "Admin Telegram"
      }
    ]);
  });

  it("uses backend audit evidence before updating aggregate channel status", async () => {
    const { submitSettingsChannelStatusToggle } = await import("../src/app/settingsChannelActions.js");

    const result = await submitSettingsChannelStatusToggle(
      {
        enabled: false,
        reason: "Settings aggregate channel disabled",
        type: "telegram"
      },
      {
        updateChannelTypeStatus: async () => ({
          status: "ok",
          data: {
            auditEvents: [{ id: "evt_channel_type_status", immutable: true }],
            channel: { activeCount: 0, enabled: false, total: 1, type: "telegram" }
          }
        })
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.channel.enabled, false);
    assert.equal(result.auditId, "evt_channel_type_status");
  });

  it("does not update aggregate channel status without immutable audit evidence", async () => {
    const { submitSettingsChannelStatusToggle } = await import("../src/app/settingsChannelActions.js");

    const result = await submitSettingsChannelStatusToggle(
      {
        enabled: false,
        reason: "Settings aggregate channel disabled",
        type: "telegram"
      },
      {
        updateChannelTypeStatus: async () => ({
          status: "ok",
          data: {
            auditEvents: [],
            channel: { activeCount: 0, enabled: false, total: 1, type: "telegram" }
          }
        })
      }
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /audit evidence/);
  });

  it("does not update aggregate channel status when backend returns a mismatched state", async () => {
    const { submitSettingsChannelStatusToggle } = await import("../src/app/settingsChannelActions.js");

    const result = await submitSettingsChannelStatusToggle(
      {
        enabled: false,
        reason: "Settings aggregate channel disabled",
        type: "telegram"
      },
      {
        updateChannelTypeStatus: async () => ({
          status: "ok",
          data: {
            auditEvents: [{ id: "evt_channel_type_status", immutable: true }],
            channel: { activeCount: 1, enabled: true, total: 1, type: "telegram" }
          }
        })
      }
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /confirmed channel state/);
  });

  it("requires backend API key rotation evidence before reporting admin workspace success", async () => {
    const { submitApiKeyRotation } = await import("../src/app/integrationAdminActions.js");

    const rejected = await submitApiKeyRotation("stage-key", {
      rotateApiKey: async () => ({
        status: "ok",
        data: {
          keyId: "stage-key",
          status: "rotation_queued"
        }
      })
    });

    assert.equal(rejected.ok, false);
    assert.match(rejected.message, /Ротация API-ключа не подтверждена/);

    const accepted = await submitApiKeyRotation("stage-key", {
      rotateApiKey: async () => ({
        status: "ok",
        data: {
          auditId: "evt_key_backend",
          keyId: "stage-key",
          rawKeyShownOnce: false,
          rotationId: "key_rotation_backend",
          status: "rotation_queued"
        }
      })
    });

    assert.equal(accepted.ok, true);
    assert.equal(accepted.keyId, "stage-key");
    assert.equal(accepted.auditId, "evt_key_backend");
  });

  it("requires backend webhook replay evidence before reporting admin workspace success", async () => {
    const { submitWebhookReplay } = await import("../src/app/integrationAdminActions.js");

    const rejected = await submitWebhookReplay({ id: "dlv-441", traceId: "hook_vk_441" }, {
      replayWebhookDelivery: async () => ({
        status: "invalid",
        error: { message: "replay denied" }
      })
    });

    assert.equal(rejected.ok, false);
    assert.match(rejected.message, /replay denied/);

    const accepted = await submitWebhookReplay({ id: "dlv-441", traceId: "hook_vk_441" }, {
      replayWebhookDelivery: async () => ({
        status: "ok",
        data: {
          auditId: "evt_webhook_backend",
          deliveryId: "dlv-441",
          originalTraceId: "hook_vk_441",
          replayId: "webhook_replay_backend",
          status: "replay_queued"
        }
      })
    });

    assert.equal(accepted.ok, true);
    assert.equal(accepted.deliveryId, "dlv-441");
    assert.equal(accepted.auditId, "evt_webhook_backend");
  });

  it("requires backend session revoke evidence before reporting admin workspace success", async () => {
    const { submitSecuritySessionRevoke } = await import("../src/app/integrationAdminActions.js");

    const rejected = await submitSecuritySessionRevoke("sess-risk", {
      revokeSecuritySession: async () => ({
        status: "ok",
        data: {
          sessionId: "sess-risk",
          status: "revoked"
        }
      })
    });

    assert.equal(rejected.ok, false);
    assert.match(rejected.message, /Отзыв сессии не подтверждён/);

    const accepted = await submitSecuritySessionRevoke("sess-risk", {
      revokeSecuritySession: async () => ({
        status: "ok",
        data: {
          auditId: "evt_session_backend",
          revokedAt: "2026-07-09T08:00:00.000Z",
          sessionId: "sess-risk",
          status: "revoked"
        }
      })
    });

    assert.equal(accepted.ok, true);
    assert.equal(accepted.sessionId, "sess-risk");
    assert.equal(accepted.auditId, "evt_session_backend");
  });

  it("routes admin workspace sensitive actions through fail-closed action helpers", () => {
    const source = readFileSync(new URL("../src/features/settings/AdminWorkspaces.jsx", import.meta.url), "utf8");

    assert.match(source, /submitApiKeyRotation/);
    assert.match(source, /submitWebhookReplay/);
    assert.match(source, /submitSecuritySessionRevoke/);
    assert.match(source, /if \(!result\.ok\)/);
    assert.doesNotMatch(source, /await integrationService\.rotateApiKey\(keyId\);\s*setRotatedKeyIds/s);
    assert.doesNotMatch(source, /await integrationService\.replayWebhookDelivery\(delivery\);\s*setReplayedDeliveryIds/s);
    assert.doesNotMatch(source, /await integrationService\.revokeSecuritySession\(sessionId\);\s*setRevokedSessionIds/s);
    assert.match(source, /setBusy\(`rotate:\$\{keyId\}`\)/);
    assert.match(source, /setBusy\(`replay:\$\{delivery\.id\}`\)/);
    assert.match(source, /setBusy\(`session:\$\{sessionId\}`\)/);
  });

  it("blocks duplicate SDK playground submissions while a request is running", () => {
    const source = readFileSync(new URL("../src/features/settings/SdkConsolePanel.jsx", import.meta.url), "utf8");

    assert.match(source, /const \[sdkPlaygroundRunning, setSdkPlaygroundRunning\] = useState\(false\)/);
    assert.match(source, /loadingWorkspace \|\| sdkPlaygroundRunning \|\| Boolean\(loadError\)/);
    assert.match(source, /finally \{\s*setSdkPlaygroundRunning\(false\)/);
  });

  it("blocks duplicate employee password and MFA resets", () => {
    const source = readFileSync(new URL("../src/features/settings/EmployeeManagementPanel.jsx", import.meta.url), "utf8");

    assert.match(source, /!canResetEmployeePassword \|\| saving/);
    assert.match(source, /resetEmployeePassword\([\s\S]*?\.finally\(\(\) => setSaving\(false\)\)/);
    assert.match(source, /resetEmployeeMfa\([\s\S]*?\.finally\(\(\) => setSaving\(false\)\)/);
  });
});
