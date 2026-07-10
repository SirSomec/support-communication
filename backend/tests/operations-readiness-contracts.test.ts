import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { OperationsRepository } from "../apps/api-gateway/src/operations/operations.repository.ts";
import { bootstrapOperationsState } from "../apps/api-gateway/src/operations/seed.ts";
import { OperationsReadinessService } from "../apps/api-gateway/src/operations/operations-readiness.service.ts";
import { IntegrationRepository } from "../apps/api-gateway/src/integrations/integration.repository.ts";
import { bootstrapIntegrationState } from "../apps/api-gateway/src/integrations/seed.ts";
import { NotificationRepository } from "../apps/api-gateway/src/notifications/notification.repository.ts";
import { ReportRepository } from "../apps/api-gateway/src/reports/report.repository.ts";
import type { ScheduledDigestDescriptorRecord } from "../apps/api-gateway/src/reports/report.repository.ts";
import type { ReportExportJob } from "../apps/api-gateway/src/reports/report.types.ts";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";

describe("phase 10 operations hardening and production readiness backend contracts", () => {
  it("returns production readiness posture across load, backup, dead-letter, migration and security domains", async () => {
    OperationsRepository.useDefault(OperationsRepository.inMemory(bootstrapOperationsState()));
    const operations = new OperationsReadinessService();

    try {
      const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

      assert.equal(readiness.service, "operationsReadinessService");
      assert.equal(readiness.status, "ok");
      assert.equal(readiness.partial, true);
      assert.equal(readiness.data.summary.productionReady, false);
      assert.ok(readiness.data.summary.blockers.some((blocker) => blocker.includes("restore")));
      assert.ok(readiness.data.loadTests.some((scenario) => scenario.id === "lt-webhook-delivery"));
      assert.ok(readiness.data.backupDrills.some((drill) => drill.id === "backup-postgres-nightly"));
      assert.ok(readiness.data.deadLetterQueues.some((queue) => queue.id === "dlq-webhooks"));
      assert.ok(readiness.data.migrationCandidates.some((migration) => migration.id === "mig-add-message-search-index"));
      assert.equal(readiness.data.migrationPolicy.requiresRollbackPlan, true);
      assert.ok(readiness.data.securityControls.some((control) => control.area === "tenant_isolation"));
    } finally {
      OperationsRepository.clearDefault();
    }
  });

  it("returns parseable worker observability timestamps from default runtime seeds", async () => {
    OperationsRepository.useDefault(OperationsRepository.inMemory(bootstrapOperationsState()));
    const integrationRepository = IntegrationRepository.inMemory(bootstrapIntegrationState({ webhookDeliveryJournal: [] }));
    const operations = new OperationsReadinessService(OperationsRepository.default(), integrationRepository);

    try {
      const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });
      const workers = readiness.data.workerObservability as Array<{
        lastDelivery: { attemptedAt?: string } | null;
        updatedAt: string;
        workerId: string;
      }>;

      assert.ok(workers.length >= 1);
      for (const worker of workers) {
        assert.equal(Number.isFinite(Date.parse(worker.updatedAt)), true, `${worker.workerId} updatedAt must be parseable`);
        if (worker.lastDelivery?.attemptedAt) {
          assert.equal(Number.isFinite(Date.parse(worker.lastDelivery.attemptedAt)), true, `${worker.workerId} lastDelivery.attemptedAt must be parseable`);
        }
      }
    } finally {
      OperationsRepository.clearDefault();
    }
  });

  it("exposes proactive delivery worker evidence from durable automation attempts", async () => {
    const automationRepository = AutomationRepository.inMemory();
    automationRepository.saveProactiveDeliveryAttempt({
      attemptedAt: "2026-07-10T08:00:00.000Z",
      attemptId: "attempt_proactive_runtime",
      channel: "SDK",
      descriptorId: "proactive_rule_runtime_tenant_demo_visitor_42",
      ruleId: "rule-runtime",
      status: "queued",
      subjectId: "visitor-42",
      tenantId: "tenant-demo",
      traceId: "trc_proactive_runtime"
    });
    AutomationRepository.useDefault(automationRepository);

    try {
      const operations = new OperationsReadinessService();
      const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });
      const proactiveWorker = readiness.data.workerObservability.find(
        (item: { workerId: string }) => item.workerId === "proactive-delivery-worker"
      );

      assert.equal(proactiveWorker.evidenceSource, "automation.proactiveDeliveryAttempts");
      assert.equal(proactiveWorker.queue, "proactive-delivery");
      assert.equal(proactiveWorker.queueDepth, 0);
      assert.equal(proactiveWorker.deadLetterCount, 0);
      assert.deepEqual(proactiveWorker.lastDelivery, {
        attemptedAt: "2026-07-10T08:00:00.000Z",
        deliveryId: "proactive_rule_runtime_tenant_demo_visitor_42",
        eventType: "proactive.delivery.queued",
        status: "queued",
        traceId: "trc_proactive_runtime"
      });
    } finally {
      AutomationRepository.clearDefault();
    }
  });

  it("exposes worker queue observability from durable webhook delivery journal evidence", async () => {
    const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
    const integrationRepository = IntegrationRepository.inMemory(bootstrapIntegrationState({
      webhookDeliveryJournal: [
        {
          attempts: 0,
          createdAt: "2026-07-03T09:00:00.000Z",
          deliveryId: "delivery-webhook-queued",
          endpointId: "endpoint-webhook-runtime",
          eventType: "message.created",
          idempotencyKey: "webhook-delivery:queued",
          payloadRef: "s3://private-bucket/payloads/queued.json",
          queue: "webhook-delivery",
          status: "queued",
          targetUrl: "https://example.test/webhook?signatureSecret=secret-runtime-value",
          tenantId: "tenant-volga",
          traceId: "trc_webhook_queued"
        },
        {
          attempts: 2,
          createdAt: "2026-07-03T09:01:00.000Z",
          deliveryId: "delivery-webhook-retry",
          endpointId: "endpoint-webhook-runtime",
          eventType: "message.created",
          idempotencyKey: "webhook-delivery:retry",
          lastAttemptAt: "2026-07-03T09:05:00.000Z",
          lastError: {
            code: "provider_timeout",
            message: "Authorization: Bearer secret-token leaked by provider",
            statusCode: 503
          },
          nextAttemptAt: "2026-07-03T09:07:00.000Z",
          payloadRef: "s3://private-bucket/payloads/retry.json",
          queue: "webhook-delivery",
          status: "retry_scheduled",
          targetUrl: "https://example.test/webhook/retry",
          tenantId: "tenant-volga",
          traceId: "trc_webhook_retry"
        },
        {
          attempts: 5,
          createdAt: "2026-07-03T09:02:00.000Z",
          deliveryId: "delivery-webhook-dead",
          endpointId: "endpoint-webhook-runtime",
          eventType: "message.created",
          idempotencyKey: "webhook-delivery:dead",
          lastAttemptAt: "2026-07-03T09:06:00.000Z",
          lastError: {
            code: "signature_failed",
            message: "signatureSecret=secret-runtime-value",
            statusCode: 401
          },
          payloadRef: "s3://private-bucket/payloads/dead.json",
          queue: "webhook-delivery",
          status: "dead_lettered",
          targetUrl: "https://example.test/webhook/dead",
          tenantId: "tenant-volga",
          traceId: "trc_webhook_dead"
        },
        {
          attempts: 1,
          createdAt: "2026-07-03T08:55:00.000Z",
          deliveryId: "delivery-webhook-delivered",
          endpointId: "endpoint-webhook-runtime",
          eventType: "message.created",
          idempotencyKey: "webhook-delivery:delivered",
          lastAttemptAt: "2026-07-03T09:03:00.000Z",
          payloadRef: "s3://private-bucket/payloads/delivered.json",
          queue: "webhook-delivery",
          status: "delivered",
          targetUrl: "https://example.test/webhook/delivered",
          tenantId: "tenant-volga",
          traceId: "trc_webhook_delivered"
        }
      ]
    }));
    const operations = new OperationsReadinessService(operationsRepository, integrationRepository);

    const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

    const [webhookWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "webhook-delivery");
    assert.equal(webhookWorker.workerId, "webhook-delivery-worker");
    assert.equal(webhookWorker.evidenceSource, "integration.webhookDeliveryJournal");
    assert.equal(webhookWorker.queueDepth, 2);
    assert.equal(webhookWorker.deadLetterCount, 1);
    assert.deepEqual(webhookWorker.health, {
      reason: "dead_lettered_deliveries_present",
      status: "blocked"
    });
    assert.deepEqual(webhookWorker.lastDelivery, {
      attemptedAt: "2026-07-03T09:06:00.000Z",
      deliveryId: "delivery-webhook-dead",
      eventType: "message.created",
      status: "dead_lettered",
      traceId: "trc_webhook_dead"
    });
    assert.equal(webhookWorker.updatedAt, "2026-07-03T09:06:00.000Z");
    const serialized = JSON.stringify(webhookWorker);
    assert.equal(serialized.includes("targetUrl"), false);
    assert.equal(serialized.includes("payloadRef"), false);
    assert.equal(serialized.includes("secret-runtime-value"), false);
    assert.equal(serialized.includes("secret-token"), false);
  });

  it("exposes browser-push worker observability from durable notification delivery descriptors", async () => {
    const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
    const integrationRepository = IntegrationRepository.inMemory(bootstrapIntegrationState({ webhookDeliveryJournal: [] }));
    const notificationRepository = NotificationRepository.inMemory();
    notificationRepository.saveNotificationDeliveryDescriptor({
      attempts: 0,
      createdAt: "2026-07-04T10:00:00.000Z",
      deliveredAt: null,
      endpointHash: "endpoint-hash-queued",
      failedAt: null,
      id: "notification-delivery-queued",
      lastError: null,
      nextAttemptAt: "2026-07-04T10:05:00.000Z",
      notificationId: "notif-queued",
      payload: {
        body: "Queued critical alert",
        title: "Critical alert",
        url: "/#/app/notifications"
      },
      providerMessageId: null,
      queue: "browser-push",
      status: "queued",
      subscriptionId: "browser-subscription-queued",
      tenantId: "tenant-volga",
      traceId: "trc_notification_queued",
      type: "browser-push.critical-alert.test",
      updatedAt: "2026-07-04T10:00:00.000Z",
      userId: "operator-volga"
    });
    notificationRepository.saveNotificationDeliveryDescriptor({
      attempts: 3,
      createdAt: "2026-07-04T10:01:00.000Z",
      deliveredAt: null,
      endpointHash: "endpoint-hash-failed",
      failedAt: "2026-07-04T10:04:00.000Z",
      id: "notification-delivery-failed",
      lastError: "provider failed for endpoint secret-browser-token",
      nextAttemptAt: null,
      notificationId: "notif-failed",
      payload: {
        body: "Failed critical alert",
        title: "Critical alert",
        url: "/#/app/notifications"
      },
      providerMessageId: null,
      queue: "browser-push",
      status: "failed",
      subscriptionId: "browser-subscription-failed",
      tenantId: "tenant-volga",
      traceId: "trc_notification_failed",
      type: "browser-push.critical-alert.test",
      updatedAt: "2026-07-04T10:04:00.000Z",
      userId: "operator-volga"
    });
    notificationRepository.saveNotificationDeliveryDescriptor({
      attempts: 1,
      createdAt: "2026-07-04T09:55:00.000Z",
      deliveredAt: "2026-07-04T10:02:00.000Z",
      endpointHash: "endpoint-hash-delivered",
      failedAt: null,
      id: "notification-delivery-delivered",
      lastError: null,
      nextAttemptAt: null,
      notificationId: "notif-delivered",
      payload: {
        body: "Delivered critical alert",
        title: "Critical alert",
        url: "/#/app/notifications"
      },
      providerMessageId: "provider-message-delivered",
      queue: "browser-push",
      status: "delivered",
      subscriptionId: "browser-subscription-delivered",
      tenantId: "tenant-volga",
      traceId: "trc_notification_delivered",
      type: "browser-push.critical-alert.test",
      updatedAt: "2026-07-04T10:02:00.000Z",
      userId: "operator-volga"
    });
    NotificationRepository.useDefault(notificationRepository);
    const operations = new OperationsReadinessService(operationsRepository, integrationRepository);

    try {
      const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

      const [browserPushWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "browser-push");
      assert.equal(browserPushWorker.workerId, "notification-delivery-worker");
      assert.equal(browserPushWorker.evidenceSource, "notifications.deliveryDescriptors");
      assert.equal(browserPushWorker.queueDepth, 1);
      assert.equal(browserPushWorker.deadLetterCount, 1);
      assert.deepEqual(browserPushWorker.health, {
        reason: "dead_lettered_deliveries_present",
        status: "blocked"
      });
      assert.deepEqual(browserPushWorker.lastDelivery, {
        attemptedAt: "2026-07-04T10:04:00.000Z",
        deliveryId: "notification-delivery-failed",
        eventType: "browser-push.critical-alert.test",
        status: "failed",
        traceId: "trc_notification_failed"
      });
      assert.equal(browserPushWorker.updatedAt, "2026-07-04T10:04:00.000Z");
      assert.ok(readiness.data.summary.blockers.some((blocker: string) => blocker.includes("browser-push worker has dead-lettered deliveries")));
      const serialized = JSON.stringify(browserPushWorker);
      assert.equal(serialized.includes("endpointHash"), false);
      assert.equal(serialized.includes("subscriptionId"), false);
      assert.equal(serialized.includes("secret-browser-token"), false);
    } finally {
      NotificationRepository.clearDefault();
    }
  });

  it("keeps browser-push worker visible with healthy zero-depth state before delivery descriptors exist", async () => {
    const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
    const integrationRepository = IntegrationRepository.inMemory(bootstrapIntegrationState({ webhookDeliveryJournal: [] }));
    NotificationRepository.useDefault(NotificationRepository.inMemory());
    const operations = new OperationsReadinessService(operationsRepository, integrationRepository);

    try {
      const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

      const [browserPushWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "browser-push");
      assert.equal(browserPushWorker.workerId, "notification-delivery-worker");
      assert.equal(browserPushWorker.evidenceSource, "notifications.deliveryDescriptors");
      assert.equal(browserPushWorker.queueDepth, 0);
      assert.equal(browserPushWorker.deadLetterCount, 0);
      assert.deepEqual(browserPushWorker.health, {
        reason: "no_pending_deliveries",
        status: "healthy"
      });
      assert.equal(browserPushWorker.lastDelivery, null);
      assert.equal(browserPushWorker.updatedAt, "1970-01-01T00:00:00.000Z");
      assert.equal(readiness.data.summary.blockers.some((blocker: string) => blocker.includes("browser-push worker")), false);
    } finally {
      NotificationRepository.clearDefault();
    }
  });

  it("exposes lead-notification worker observability from public demo request notification descriptors", async () => {
    const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
    const integrationRepository = IntegrationRepository.inMemory(bootstrapIntegrationState({
      publicDemoRequestNotificationDescriptors: [
        publicDemoNotificationDescriptor({
          createdAt: "2026-07-04T12:00:00.000Z",
          id: "lead-notification-queued",
          leadId: "lead-queued",
          status: "queued"
        }),
        publicDemoNotificationDescriptor({
          createdAt: "2026-07-04T12:01:00.000Z",
          id: "lead-notification-delivered",
          leadId: "lead-delivered",
          payload: {
            company: "Acme Delivered",
            delivery: {
              attempts: 1,
              deliveredAt: "2026-07-04T12:03:00.000Z",
              providerMessageId: "provider-message-secret-delivered"
            },
            email: "delivered-owner@acme.example",
            messagePreview: "Delivered private lead note",
            name: "Delivered Owner",
            planInterest: "enterprise",
            source: "landing"
          },
          status: "delivered"
        }),
        publicDemoNotificationDescriptor({
          createdAt: "2026-07-04T12:02:00.000Z",
          id: "lead-notification-failed",
          leadId: "lead-failed",
          payload: {
            company: "Acme Failed",
            delivery: {
              attempts: 2,
              failedAt: "2026-07-04T12:05:00.000Z",
              lastError: {
                code: "public_demo_request_notification_delivery_failed",
                message: "smtp failed for token secret-demo-provider-token and failed-owner@acme.example"
              }
            },
            email: "failed-owner@acme.example",
            messagePreview: "Failed private lead note",
            name: "Failed Owner",
            planInterest: "enterprise",
            source: "landing"
          },
          status: "failed"
        })
      ]
    }));
    const notificationRepository = NotificationRepository.inMemory();
    const emptyReportState = ReportRepository.inMemory().readState();
    const reportRepository = ReportRepository.inMemory({ ...emptyReportState, exportJobs: [] });
    const operations = new OperationsReadinessService(
      operationsRepository,
      integrationRepository,
      notificationRepository,
      reportRepository
    );

    const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

    const [leadNotificationWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "lead-notification");
    assert.equal(leadNotificationWorker.workerId, "lead-notification-worker");
    assert.equal(leadNotificationWorker.evidenceSource, "integration.publicDemoRequestNotificationDescriptors");
    assert.equal(leadNotificationWorker.queueDepth, 1);
    assert.equal(leadNotificationWorker.deadLetterCount, 1);
    assert.deepEqual(leadNotificationWorker.health, {
      reason: "dead_lettered_deliveries_present",
      status: "blocked"
    });
    assert.deepEqual(leadNotificationWorker.lastDelivery, {
      attemptedAt: "2026-07-04T12:05:00.000Z",
      deliveryId: "lead-notification-failed",
      eventType: "public.demo_request.notification.requested",
      status: "failed",
      traceId: "lead-failed"
    });
    assert.equal(leadNotificationWorker.updatedAt, "2026-07-04T12:05:00.000Z");
    assert.ok(readiness.data.summary.blockers.some((blocker: string) => blocker.includes("lead-notification worker has dead-lettered deliveries")));
    const serialized = JSON.stringify(leadNotificationWorker);
    assert.equal(serialized.includes("failed-owner@acme.example"), false);
    assert.equal(serialized.includes("secret-demo-provider-token"), false);
    assert.equal(serialized.includes("provider-message-secret-delivered"), false);
    assert.equal(serialized.includes("Failed private lead note"), false);
  });

  it("keeps lead-notification worker visible with healthy zero-depth state before demo notification descriptors exist", async () => {
    const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
    const integrationRepository = IntegrationRepository.inMemory(bootstrapIntegrationState({
      publicDemoRequestNotificationDescriptors: []
    }));
    const notificationRepository = NotificationRepository.inMemory();
    const emptyReportState = ReportRepository.inMemory().readState();
    const reportRepository = ReportRepository.inMemory({ ...emptyReportState, exportJobs: [] });
    const operations = new OperationsReadinessService(
      operationsRepository,
      integrationRepository,
      notificationRepository,
      reportRepository
    );

    const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

    const [leadNotificationWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "lead-notification");
    assert.equal(leadNotificationWorker.workerId, "lead-notification-worker");
    assert.equal(leadNotificationWorker.evidenceSource, "integration.publicDemoRequestNotificationDescriptors");
    assert.equal(leadNotificationWorker.queueDepth, 0);
    assert.equal(leadNotificationWorker.deadLetterCount, 0);
    assert.deepEqual(leadNotificationWorker.health, {
      reason: "no_pending_deliveries",
      status: "healthy"
    });
    assert.equal(leadNotificationWorker.lastDelivery, null);
    assert.equal(leadNotificationWorker.updatedAt, "1970-01-01T00:00:00.000Z");
    assert.equal(readiness.data.summary.blockers.some((blocker: string) => blocker.includes("lead-notification worker")), false);
  });

  it("uses aggregate lead-notification observability without scanning delivered descriptor history", async () => {
    const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
    const integrationRepository = {
      async listWebhookDeliveryJournalAsync() {
        return [];
      },
      async listPublicDemoRequestNotificationDescriptorsAsync() {
        throw new Error("unbounded_lead_notification_descriptor_scan");
      },
      async summarizePublicDemoRequestNotificationDescriptorsAsync() {
        return {
          deadLetterCount: 1,
          latestDescriptor: publicDemoNotificationDescriptor({
            createdAt: "2026-07-04T12:15:00.000Z",
            id: "lead-notification-aggregate-failed",
            leadId: "lead-aggregate-failed",
            payload: {
              company: "Aggregate Failed",
              delivery: {
                attempts: 3,
                failedAt: "2026-07-04T12:20:00.000Z",
                lastError: {
                  code: "public_demo_request_notification_delivery_failed",
                  message: "smtp failed for token secret-aggregate-token"
                }
              },
              email: "aggregate-failed@acme.example",
              messagePreview: "Aggregate private lead note",
              name: "Aggregate Owner",
              planInterest: "enterprise",
              source: "landing"
            },
            status: "failed"
          }),
          queue: "lead-notification",
          queueDepth: 7
        };
      }
    } as unknown as IntegrationRepository;
    const notificationRepository = NotificationRepository.inMemory();
    const emptyReportState = ReportRepository.inMemory().readState();
    const reportRepository = ReportRepository.inMemory({ ...emptyReportState, exportJobs: [] });
    const operations = new OperationsReadinessService(
      operationsRepository,
      integrationRepository,
      notificationRepository,
      reportRepository
    );

    const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

    const [leadNotificationWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "lead-notification");
    assert.equal(leadNotificationWorker.queueDepth, 7);
    assert.equal(leadNotificationWorker.deadLetterCount, 1);
    assert.deepEqual(leadNotificationWorker.lastDelivery, {
      attemptedAt: "2026-07-04T12:20:00.000Z",
      deliveryId: "lead-notification-aggregate-failed",
      eventType: "public.demo_request.notification.requested",
      status: "failed",
      traceId: "lead-aggregate-failed"
    });
    const serialized = JSON.stringify(leadNotificationWorker);
    assert.equal(serialized.includes("aggregate-failed@acme.example"), false);
    assert.equal(serialized.includes("secret-aggregate-token"), false);
    assert.equal(serialized.includes("Aggregate private lead note"), false);
  });

  it("exposes report-export worker observability from durable export jobs", async () => {
    const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
    const integrationRepository = IntegrationRepository.inMemory(bootstrapIntegrationState({ webhookDeliveryJournal: [] }));
    const notificationRepository = NotificationRepository.inMemory();
    const emptyReportState = ReportRepository.inMemory().readState();
    const reportRepository = ReportRepository.inMemory({ ...emptyReportState, exportJobs: [] });
    reportRepository.saveExportJob(reportExportJob({
      backendQueueId: "queue-report-export-queued",
      createdAt: "2026-07-04T11:00:00.000Z",
      id: "report-export-queued",
      status: "Queued",
      statusKey: "queued"
    }));
    reportRepository.saveExportJob(reportExportJob({
      backendQueueId: "queue-report-export-running",
      createdAt: "2026-07-04T11:02:00.000Z",
      id: "report-export-running",
      progress: 45,
      status: "Running",
      statusKey: "running"
    }));
    reportRepository.saveExportJob(reportExportJob({
      backendQueueId: "queue-report-export-ready",
      createdAt: "2026-07-04T11:03:00.000Z",
      id: "report-export-ready",
      status: "Ready",
      statusKey: "ready"
    }));
    reportRepository.saveExportJob(reportExportJob({
      backendQueueId: "queue-report-export-error",
      createdAt: "2026-07-04T11:04:00.000Z",
      deadLetteredAt: "2026-07-04T11:06:00.000Z",
      failureCode: "object_storage_put_failed",
      failureMessage: "providerToken=secret-report-export-token leaked by provider",
      filters: {
        tenantId: "tenant-volga",
        privateExportFilter: "secret-filter-value"
      },
      id: "report-export-error",
      status: "Error",
      statusKey: "error"
    }));
    reportRepository.saveExportJob(reportExportJob({
      backendQueueId: "queue-report-export-expired",
      createdAt: "2026-07-04T10:59:00.000Z",
      id: "report-export-expired",
      status: "Expired",
      statusKey: "expired"
    }));
    const operations = new OperationsReadinessService(
      operationsRepository,
      integrationRepository,
      notificationRepository,
      reportRepository
    );

    const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

    const [reportExportWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "report-export");
    assert.equal(reportExportWorker.workerId, "report-export-worker");
    assert.equal(reportExportWorker.evidenceSource, "reports.exportJobs");
    assert.equal(reportExportWorker.queueDepth, 2);
    assert.equal(reportExportWorker.deadLetterCount, 2);
    assert.deepEqual(reportExportWorker.health, {
      reason: "dead_lettered_deliveries_present",
      status: "blocked"
    });
    assert.deepEqual(reportExportWorker.lastDelivery, {
      attemptedAt: "2026-07-04T11:06:00.000Z",
      deliveryId: "report-export-error",
      eventType: "report.export",
      status: "error",
      traceId: "queue-report-export-error"
    });
    assert.equal(reportExportWorker.updatedAt, "2026-07-04T11:06:00.000Z");
    assert.ok(readiness.data.summary.blockers.some((blocker: string) => blocker.includes("report-export worker has dead-lettered deliveries")));
    const serialized = JSON.stringify(reportExportWorker);
    assert.equal(serialized.includes("failureMessage"), false);
    assert.equal(serialized.includes("providerToken"), false);
    assert.equal(serialized.includes("privateExportFilter"), false);
    assert.equal(serialized.includes("secret-filter-value"), false);
  });

  it("keeps report-export worker visible with healthy zero-depth state before export jobs exist", async () => {
    const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
    const integrationRepository = IntegrationRepository.inMemory(bootstrapIntegrationState({ webhookDeliveryJournal: [] }));
    const notificationRepository = NotificationRepository.inMemory();
    const emptyReportState = ReportRepository.inMemory().readState();
    const reportRepository = ReportRepository.inMemory({ ...emptyReportState, exportJobs: [] });
    const operations = new OperationsReadinessService(
      operationsRepository,
      integrationRepository,
      notificationRepository,
      reportRepository
    );

    const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

    const [reportExportWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "report-export");
    assert.equal(reportExportWorker.workerId, "report-export-worker");
    assert.equal(reportExportWorker.evidenceSource, "reports.exportJobs");
    assert.equal(reportExportWorker.queueDepth, 0);
    assert.equal(reportExportWorker.deadLetterCount, 0);
    assert.deepEqual(reportExportWorker.health, {
      reason: "no_pending_deliveries",
      status: "healthy"
    });
    assert.equal(reportExportWorker.lastDelivery, null);
    assert.equal(reportExportWorker.updatedAt, "1970-01-01T00:00:00.000Z");
    assert.equal(readiness.data.summary.blockers.some((blocker: string) => blocker.includes("report-export worker")), false);
  });

  it("uses failing report-export jobs as blocked readiness evidence even without a dead-letter timestamp", async () => {
    const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
    const integrationRepository = IntegrationRepository.inMemory(bootstrapIntegrationState({ webhookDeliveryJournal: [] }));
    const notificationRepository = NotificationRepository.inMemory();
    const emptyReportState = ReportRepository.inMemory().readState();
    const reportRepository = ReportRepository.inMemory({ ...emptyReportState, exportJobs: [] });
    reportRepository.saveExportJob(reportExportJob({
      backendQueueId: "queue-report-export-error-without-dead-letter-time",
      createdAt: "2026-07-04T11:01:00.000Z",
      failureCode: "report_export_worker_failed",
      failureMessage: "providerToken=secret-report-export-token leaked by worker",
      id: "report-export-error-without-dead-letter-time",
      status: "Error",
      statusKey: "error"
    }));
    reportRepository.saveExportJob(reportExportJob({
      backendQueueId: "queue-report-export-newer-ready",
      createdAt: "2026-07-04T11:10:00.000Z",
      id: "report-export-newer-ready",
      status: "Ready",
      statusKey: "ready"
    }));
    const operations = new OperationsReadinessService(
      operationsRepository,
      integrationRepository,
      notificationRepository,
      reportRepository
    );

    const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

    const [reportExportWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "report-export");
    assert.equal(reportExportWorker.deadLetterCount, 1);
    assert.deepEqual(reportExportWorker.health, {
      reason: "dead_lettered_deliveries_present",
      status: "blocked"
    });
    assert.deepEqual(reportExportWorker.lastDelivery, {
      attemptedAt: "2026-07-04T11:01:00.000Z",
      deliveryId: "report-export-error-without-dead-letter-time",
      eventType: "report.export",
      status: "error",
      traceId: "queue-report-export-error-without-dead-letter-time"
    });
    assert.equal(reportExportWorker.updatedAt, "2026-07-04T11:01:00.000Z");
    assert.equal(JSON.stringify(reportExportWorker).includes("secret-report-export-token"), false);
  });

  it("exposes report-digest worker observability from durable scheduled digest descriptors", async () => {
    const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
    const integrationRepository = IntegrationRepository.inMemory(bootstrapIntegrationState({ webhookDeliveryJournal: [] }));
    const notificationRepository = NotificationRepository.inMemory();
    const emptyReportState = ReportRepository.inMemory().readState();
    const reportRepository = ReportRepository.inMemory({
      ...emptyReportState,
      exportJobs: [],
      scheduledDigestDescriptors: []
    });
    reportRepository.saveScheduledDigestDescriptor(scheduledDigestDescriptor({
      dueAt: "2026-07-04T11:00:00.000Z",
      id: "digest-report-due",
      periodKey: "2026-07-04",
      status: "due",
      updatedAt: "2026-07-04T11:00:00.000Z"
    }));
    reportRepository.saveScheduledDigestDescriptor(scheduledDigestDescriptor({
      dueAt: "2026-07-04T11:01:00.000Z",
      id: "digest-report-running",
      periodKey: "2026-07-04T11",
      status: "running",
      updatedAt: "2026-07-04T11:02:00.000Z"
    }));
    reportRepository.saveScheduledDigestDescriptor(scheduledDigestDescriptor({
      dueAt: "2026-07-04T10:55:00.000Z",
      id: "digest-report-completed",
      periodKey: "2026-07-03",
      status: "completed",
      updatedAt: "2026-07-04T11:03:00.000Z"
    }));
    reportRepository.saveScheduledDigestDescriptor(scheduledDigestDescriptor({
      dueAt: "2026-07-04T10:59:00.000Z",
      id: "digest-report-failed-old",
      periodKey: "2026-07-02",
      status: "failed",
      updatedAt: "2026-07-04T11:04:00.000Z"
    }));
    reportRepository.saveScheduledDigestDescriptor(scheduledDigestDescriptor({
      dueAt: "2026-07-04T10:58:00.000Z",
      id: "digest-report-failed-new",
      periodKey: "2026-07-01",
      status: "failed",
      updatedAt: "2026-07-04T11:06:00.000Z"
    }));
    const operations = new OperationsReadinessService(
      operationsRepository,
      integrationRepository,
      notificationRepository,
      reportRepository
    );

    const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

    const [reportDigestWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "report-digest");
    assert.equal(reportDigestWorker.workerId, "report-digest-worker");
    assert.equal(reportDigestWorker.evidenceSource, "reports.scheduledDigestDescriptors");
    assert.equal(reportDigestWorker.queueDepth, 2);
    assert.equal(reportDigestWorker.deadLetterCount, 2);
    assert.deepEqual(reportDigestWorker.health, {
      reason: "dead_lettered_deliveries_present",
      status: "blocked"
    });
    assert.deepEqual(reportDigestWorker.lastDelivery, {
      attemptedAt: "2026-07-04T11:06:00.000Z",
      deliveryId: "digest-report-failed-new",
      eventType: "report.digest",
      status: "failed",
      traceId: "digest-volga-daily:2026-07-01"
    });
    assert.equal(reportDigestWorker.updatedAt, "2026-07-04T11:06:00.000Z");
    assert.ok(readiness.data.summary.blockers.some((blocker: string) => blocker.includes("report-digest worker has dead-lettered deliveries")));
    const serialized = JSON.stringify(reportDigestWorker);
    assert.equal(serialized.includes("tenant-volga"), false);
  });

  it("exposes outbox and billing-sync worker observability from durable queue summaries", async () => {
    const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
    const integrationRepository = IntegrationRepository.inMemory(bootstrapIntegrationState({ webhookDeliveryJournal: [] }));
    const notificationRepository = NotificationRepository.inMemory();
    const emptyReportState = ReportRepository.inMemory().readState();
    const reportRepository = ReportRepository.inMemory({ ...emptyReportState, exportJobs: [] });
    const queueObservabilitySource = {
      async summarizeOutboxQueue({ queue }: { queue: string }) {
        if (queue === "file-scan") {
          return {
            deadLetterCount: 0,
            latestEvent: null,
            queue,
            queueDepth: 0
          };
        }

        assert.equal(queue, "message-delivery");

        return {
          deadLetterCount: 1,
          latestEvent: {
            aggregateId: "conversation-secret-aggregate",
            aggregateType: "conversation",
            attempts: 3,
            deadLetteredAt: "2026-07-04T13:05:00.000Z",
            id: "outbox-message-delivery-dead",
            lastError: "provider token secret-outbox-token leaked",
            lockedAt: null,
            nextAttemptAt: null,
            occurredAt: "2026-07-04T13:00:00.000Z",
            payload: {
              body: "Private outbound message",
              providerToken: "secret-outbox-token"
            },
            publishedAt: null,
            queue: "message-delivery",
            status: "dead_lettered",
            traceId: "trc_outbox_dead",
            type: "message.delivery.requested"
          },
          queue: "message-delivery",
          queueDepth: 2
        };
      },
      async summarizeBillingSyncQueue({ queue }: { queue: string }) {
        assert.equal(queue, "billing-sync");

        return {
          deadLetterCount: 1,
          latestJob: {
            actor: "billing-provider",
            actorName: "stripe",
            attempts: 2,
            auditEventId: "evt_billing_sync_dead",
            createdAt: "2026-07-04T14:00:00.000Z",
            deadLetteredAt: "2026-07-04T14:08:00.000Z",
            fromPlanId: "starter",
            id: "billing-sync-dead",
            lastError: "provider api key secret-billing-token leaked",
            lockedAt: null,
            nextAttemptAt: null,
            payload: {
              providerApiKey: "secret-billing-token",
              tenantId: "tenant-secret"
            },
            publishedAt: null,
            queue: "billing-sync",
            reason: "plan-change-secret-reason",
            status: "dead_lettered",
            tenantId: "tenant-secret",
            toPlanId: "business",
            traceId: "trc_billing_dead"
          },
          queue: "billing-sync",
          queueDepth: 1
        };
      }
    };
    const operations = new (OperationsReadinessService as unknown as new (...args: unknown[]) => OperationsReadinessService)(
      operationsRepository,
      integrationRepository,
      notificationRepository,
      reportRepository,
      queueObservabilitySource
    );

    const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

    const [outboxWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "message-delivery");
    assert.equal(outboxWorker.workerId, "outbox-worker");
    assert.equal(outboxWorker.evidenceSource, "database.outboxEvents");
    assert.equal(outboxWorker.queueDepth, 2);
    assert.equal(outboxWorker.deadLetterCount, 1);
    assert.deepEqual(outboxWorker.lastDelivery, {
      attemptedAt: "2026-07-04T13:05:00.000Z",
      deliveryId: "outbox-message-delivery-dead",
      eventType: "message.delivery.requested",
      status: "dead_lettered",
      traceId: "trc_outbox_dead"
    });
    assert.equal(outboxWorker.updatedAt, "2026-07-04T13:05:00.000Z");

    const [billingWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "billing-sync");
    assert.equal(billingWorker.workerId, "billing-sync-worker");
    assert.equal(billingWorker.evidenceSource, "database.billingSyncJobs");
    assert.equal(billingWorker.queueDepth, 1);
    assert.equal(billingWorker.deadLetterCount, 1);
    assert.deepEqual(billingWorker.lastDelivery, {
      attemptedAt: "2026-07-04T14:08:00.000Z",
      deliveryId: "billing-sync-dead",
      eventType: "billing.sync",
      status: "dead_lettered",
      traceId: "trc_billing_dead"
    });
    assert.equal(billingWorker.updatedAt, "2026-07-04T14:08:00.000Z");
    assert.ok(readiness.data.summary.blockers.some((blocker: string) => blocker.includes("message-delivery worker has dead-lettered deliveries")));
    assert.ok(readiness.data.summary.blockers.some((blocker: string) => blocker.includes("billing-sync worker has dead-lettered deliveries")));

    const serialized = JSON.stringify(readiness.data.workerObservability);
    assert.equal(serialized.includes("Private outbound message"), false);
    assert.equal(serialized.includes("secret-outbox-token"), false);
    assert.equal(serialized.includes("secret-billing-token"), false);
    assert.equal(serialized.includes("plan-change-secret-reason"), false);
  });

  it("exposes file-scan scanner worker observability from durable outbox queue summaries", async () => {
    const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
    const integrationRepository = IntegrationRepository.inMemory(bootstrapIntegrationState({ webhookDeliveryJournal: [] }));
    const notificationRepository = NotificationRepository.inMemory();
    const emptyReportState = ReportRepository.inMemory().readState();
    const reportRepository = ReportRepository.inMemory({ ...emptyReportState, exportJobs: [] });
    const queueObservabilitySource = {
      async summarizeOutboxQueue({ queue }: { queue: string }) {
        if (queue === "message-delivery") {
          return {
            deadLetterCount: 0,
            latestEvent: null,
            queue,
            queueDepth: 0
          };
        }

        assert.equal(queue, "file-scan");

        return {
          deadLetterCount: 1,
          latestEvent: {
            aggregateId: "attachment-secret-aggregate",
            aggregateType: "attachment",
            attempts: 3,
            deadLetteredAt: "2026-07-04T15:05:00.000Z",
            id: "outbox-file-scan-dead",
            lastError: "scanner failed for tenant-volga/private/uploads/secret-file.pdf with authorization=Bearer secret-scanner-token",
            lockedAt: null,
            nextAttemptAt: null,
            occurredAt: "2026-07-04T15:00:00.000Z",
            payload: {
              objectKey: "tenant-volga/private/uploads/secret-file.pdf",
              scannerToken: "secret-scanner-token"
            },
            publishedAt: null,
            queue: "file-scan",
            status: "dead_lettered",
            traceId: "trc_file_scan_dead",
            type: "attachment.upload.requested"
          },
          queue: "file-scan",
          queueDepth: 2
        };
      },
      async summarizeBillingSyncQueue({ queue }: { queue: string }) {
        return {
          deadLetterCount: 0,
          latestJob: null,
          queue,
          queueDepth: 0
        };
      }
    };
    const operations = new (OperationsReadinessService as unknown as new (...args: unknown[]) => OperationsReadinessService)(
      operationsRepository,
      integrationRepository,
      notificationRepository,
      reportRepository,
      queueObservabilitySource
    );

    const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

    const [fileScanWorker] = readiness.data.workerObservability.filter((item: { queue: string }) => item.queue === "file-scan");
    assert.equal(fileScanWorker.workerId, "file-scan-scanner-worker");
    assert.equal(fileScanWorker.evidenceSource, "database.outboxEvents");
    assert.equal(fileScanWorker.queueDepth, 2);
    assert.equal(fileScanWorker.deadLetterCount, 1);
    assert.deepEqual(fileScanWorker.health, {
      reason: "dead_lettered_deliveries_present",
      status: "blocked"
    });
    assert.deepEqual(fileScanWorker.lastDelivery, {
      attemptedAt: "2026-07-04T15:05:00.000Z",
      deliveryId: "outbox-file-scan-dead",
      eventType: "attachment.upload.requested",
      status: "dead_lettered",
      traceId: "trc_file_scan_dead"
    });
    assert.equal(fileScanWorker.updatedAt, "2026-07-04T15:05:00.000Z");
    assert.ok(readiness.data.summary.blockers.some((blocker: string) => blocker.includes("file-scan worker has dead-lettered deliveries")));

    const serialized = JSON.stringify(fileScanWorker);
    assert.equal(serialized.includes("tenant-volga/private/uploads/secret-file.pdf"), false);
    assert.equal(serialized.includes("secret-scanner-token"), false);
    assert.equal(serialized.includes("lastError"), false);
  });

  it("queues load test runs with target workflow coverage, audit metadata and idempotency", async () => {
    const operations = new OperationsReadinessService();

    const missingReason = await operations.queueLoadTestRun({
      confirmed: true,
      reason: "",
      scenarioId: "lt-critical-flows"
    });
    assert.equal(missingReason.status, "invalid");
    assert.equal(missingReason.error?.code, "reason_required");

    const missingConfirmation = await operations.queueLoadTestRun({
      reason: "Validate critical flow capacity",
      scenarioId: "lt-critical-flows"
    });
    assert.equal(missingConfirmation.status, "invalid");
    assert.equal(missingConfirmation.error?.code, "confirmation_required");

    const queued = await operations.queueLoadTestRun({
      confirmed: true,
      idempotencyKey: "load-critical-flows",
      reason: "Validate critical flow capacity",
      scenarioId: "lt-critical-flows"
    });
    assert.equal(queued.status, "ok");
    assert.equal(queued.data.run.queue, "load-test-runs");
    assert.deepEqual(queued.data.run.workflows, ["dialogs", "message-send", "webhook-delivery", "report-export", "realtime-fanout"]);
    assert.equal(queued.data.auditEvent.action, "operations.load_test.queue");
    assert.equal(queued.data.auditEvent.immutable, true);

    const duplicate = await operations.queueLoadTestRun({
      confirmed: true,
      idempotencyKey: "load-critical-flows",
      reason: "Validate critical flow capacity",
      scenarioId: "lt-critical-flows"
    });
    assert.equal(duplicate.status, "ok");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.run.id, queued.data.run.id);

    const conflict = await operations.queueLoadTestRun({
      confirmed: true,
      idempotencyKey: "load-critical-flows",
      reason: "Validate webhook capacity",
      scenarioId: "lt-webhook-delivery"
    });
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.error?.code, "idempotency_key_reused");

    const webhookDelivery = await operations.queueLoadTestRun({
      confirmed: true,
      idempotencyKey: "load-webhook-delivery",
      reason: "Validate webhook delivery capacity",
      scenarioId: "lt-webhook-delivery"
    });
    assert.equal(webhookDelivery.status, "ok");
    assert.deepEqual(webhookDelivery.data.run.workflows, ["webhook-delivery", "dead-letter-replay"]);
    assert.equal(webhookDelivery.data.execution.status, "queued");
  });

  it("queues backup restore checks and migration rollback compatibility checks", async () => {
    const operations = new OperationsReadinessService();

    const restore = await operations.queueRestoreCheck({
      confirmed: true,
      drillId: "backup-postgres-nightly",
      reason: "Quarterly restore drill"
    });
    assert.equal(restore.status, "ok");
    assert.equal(restore.data.restoreCheck.queue, "restore-drills");
    assert.equal(restore.data.restoreCheck.destructiveAllowed, false);
    assert.ok(restore.data.restoreCheck.targets.includes("postgres"));
    assert.ok(restore.data.restoreCheck.targets.includes("object-storage-metadata"));
    assert.equal(restore.data.auditEvent.action, "operations.restore_check.queue");
    assert.equal(restore.data.workerResults.postgres?.result?.status, "failed");
    assert.equal(restore.data.workerResults.postgres?.envelope?.code, "postgres_restore_check_failed");
    assert.equal(restore.data.workerResults.objectStorage?.existence?.result?.status, "missing");
    assert.equal(restore.data.workerResults.objectStorage?.existence?.denial?.code, "object_storage_restore_check_artifact_missing");

    const idempotentRestore = await operations.queueRestoreCheck({
      confirmed: true,
      drillId: "backup-postgres-nightly",
      idempotencyKey: "restore-postgres-nightly",
      reason: "Quarterly restore drill"
    });
    assert.equal(idempotentRestore.status, "ok");

    const duplicateRestore = await operations.queueRestoreCheck({
      confirmed: true,
      drillId: "backup-postgres-nightly",
      idempotencyKey: "restore-postgres-nightly",
      reason: "Quarterly restore drill"
    });
    assert.equal(duplicateRestore.status, "ok");
    assert.equal(duplicateRestore.data.duplicate, true);
    assert.equal(duplicateRestore.data.restoreCheck.id, idempotentRestore.data.restoreCheck.id);

    const restoreConflict = await operations.queueRestoreCheck({
      confirmed: true,
      drillId: "backup-audit-ledger",
      idempotencyKey: "restore-postgres-nightly",
      reason: "Audit restore drill"
    });
    assert.equal(restoreConflict.status, "conflict");
    assert.equal(restoreConflict.error?.code, "idempotency_key_reused");

    const rollback = await operations.checkMigrationRollback({
      confirmed: true,
      migrationId: "mig-add-message-search-index",
      reason: "Validate release rollback policy"
    });
    assert.equal(rollback.status, "ok");
    assert.equal(rollback.data.policy.requiresRollbackPlan, true);
    assert.equal(rollback.data.compatibilityChecks.every((check) => check.status !== "failed"), true);
    assert.match(rollback.data.rollbackPlan.applyCommand, /npm run db:migrate/);
    assert.match(rollback.data.rollbackPlan.rollbackCommand, /npm run db:rollback/);
    assert.equal(rollback.data.auditEvent.action, "operations.migration.rollback_check");
    assert.equal(rollback.data.toolingStatus, "passed");
    assert.equal(rollback.data.toolingResults.length, 3);

    const failedRollback = await operations.checkMigrationRollback({
      confirmed: true,
      migrationId: "mig-drop-legacy-channel",
      reason: "Validate failed rollback gate"
    });
    assert.equal(failedRollback.status, "conflict");
    assert.equal(failedRollback.error?.code, "migration_compatibility_failed");
  });

  it("exposes dead-letter replay tooling and security review controls without leaking secrets", async () => {
    const repository = OperationsRepository.inMemory();
    const operations = new OperationsReadinessService(repository);

    const deadLetters = await operations.fetchDeadLetterDashboard({ queue: "webhook-delivery" });
    assert.equal(deadLetters.status, "ok");
    assert.ok(deadLetters.data.queues.every((queue) => queue.name === "webhook-delivery"));
    assert.ok(deadLetters.data.messages.some((message) => message.id === "dlm-webhook-001"));

    const replay = await operations.replayDeadLetterMessage({
      confirmed: true,
      idempotencyKey: "replay-webhook-001",
      messageId: "dlm-webhook-001",
      reason: "Replay after signature fix"
    });
    assert.equal(replay.status, "conflict");
    assert.equal(replay.error?.code, "dead_letter_replay_backend_unavailable");
    assert.equal(repository.readState().deadLetterReplays.length, 0);
    assert.equal(repository.listDeadLetterReplayValidationDenials({ messageId: "dlm-webhook-001" })[0]?.code, "dead_letter_replay_backend_unavailable");

    const disabledReplay = await operations.replayDeadLetterMessage({
      confirmed: true,
      messageId: "dlm-billing-001",
      reason: "Replay disabled queue"
    });
    assert.equal(disabledReplay.status, "conflict");
    assert.equal(disabledReplay.error?.code, "dead_letter_replay_disabled");

    const security = await operations.fetchSecurityReview({ area: "api_keys" });
    assert.equal(security.status, "ok");
    assert.ok(security.data.controls.every((control) => control.area === "api_keys"));
    assert.ok(security.data.controls.every((control) => control.secretMaterialExposed === false));
    assert.ok(security.data.controls.some((control) => control.evidence.some((item) => item.includes("rotation"))));

    const invalidSecurityArea = await operations.fetchSecurityReview({ area: "payments" });
    assert.equal(invalidSecurityArea.status, "invalid");
    assert.equal(invalidSecurityArea.error?.code, "security_area_unsupported");
    assert.ok(invalidSecurityArea.data.supportedAreas.includes("api_keys"));
  });

  it("runs release verification gates from the PostgreSQL smoke entrypoint", () => {
    const smoke = readFileSync(new URL("../scripts/smoke-postgres.mjs", import.meta.url), "utf8");

    assert.match(smoke, /tenant-isolation:verify/);
    assert.match(smoke, /audit-immutability:verify/);
    assert.match(smoke, /redaction:runtime-smoke/);
  });
});

function reportExportJob(overrides: Partial<ReportExportJob> = {}): ReportExportJob {
  return {
    auditId: "audit-report-export-observability",
    backendQueueId: "queue-report-export-observability",
    columns: ["metric", "today"],
    createdAt: "2026-07-04T11:00:00.000Z",
    filters: {},
    format: "CSV",
    id: "report-export-observability",
    metricDefinitionVersion: "metrics/v1",
    name: "Report export observability",
    period: "today",
    progress: 0,
    queue: "report-export",
    requestedBy: "operator-report-observability",
    rows: 0,
    status: "Queued",
    statusKey: "queued",
    ...overrides
  };
}

function scheduledDigestDescriptor(overrides: Partial<ScheduledDigestDescriptorRecord> = {}): ScheduledDigestDescriptorRecord {
  return {
    createdAt: "2026-07-04T10:00:00.000Z",
    dueAt: "2026-07-04T11:00:00.000Z",
    id: "digest-report-observability",
    periodKey: "2026-07-04",
    reportType: "daily_support_digest",
    scheduleId: "digest-volga-daily",
    status: "due",
    tenantId: "tenant-volga",
    updatedAt: "2026-07-04T10:00:00.000Z",
    ...overrides
  };
}

function publicDemoNotificationDescriptor(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: "2026-07-04T12:00:00.000Z",
    id: "lead-notification-observability",
    leadId: "lead-observability",
    payload: {
      company: "Acme Runtime",
      email: "owner@acme.example",
      messagePreview: "Need production demo runtime",
      name: "Runtime Owner",
      planInterest: "enterprise",
      source: "landing"
    },
    queue: "lead-notification",
    status: "queued",
    type: "public.demo_request.notification.requested",
    ...overrides
  };
}
