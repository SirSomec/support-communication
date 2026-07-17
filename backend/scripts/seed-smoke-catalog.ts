// AUTO-ASSEMBLED Phase C smoke catalog seeder (prisma-only runtime plan 2026-07-15).
// Writes the demo fixture catalog (createLocalDevelopmentRepositorySeeds) into the
// dedicated smoke Postgres DB via each domain prisma repository, FK-safe order.
// Per-domain writer functions were drafted + adversarially verified by workflow.
// Run AFTER prisma:migrate:deploy + prisma:seed (permission_role reference table).
import { createPrismaClient } from "@support-communication/database";
import { createLocalDevelopmentRepositorySeeds } from "../apps/api-gateway/src/runtime/local-development-seed.js";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.js";
import { BillingRepository } from "../apps/api-gateway/src/billing/billing.repository.js";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.js";
import { RoutingRepository } from "../apps/api-gateway/src/routing/routing.repository.js";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.js";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.js";
import { ReportRepository } from "../apps/api-gateway/src/reports/report.repository.js";
import { exportJobFixtures } from "../apps/api-gateway/src/reports/seed-catalog.js";
import { IntegrationRepository } from "../apps/api-gateway/src/integrations/integration.repository.js";
import { OperationsRepository } from "../apps/api-gateway/src/operations/operations.repository.js";
import { PlatformRepository } from "../apps/api-gateway/src/platform/platform.repository.js";
import { QualityRepository } from "../apps/api-gateway/src/quality/quality.repository.js";

async function seedIdentity(repo, state) {
  // prismaSeedAccepted === false: IdentityRepository.prisma({ client }) takes no seed
  // (PrismaIdentityRepositoryOptions = { client } only; the Prisma adapter constructor
  // does no seed write), so each populated State collection is written explicitly,
  // in FK/dependency order via the public IdentityRepository methods.

  // 1. Tenants first — parents of tenantUsers and tenantAuditEvents.
  //    saveTenant (repo line 738 -> Prisma line 1937) create-or-update on tenant.id.
  for (const tenant of state.tenants) {
    await repo.saveTenant(tenant);
  }

  // 2. Tenant users — FK tenantUser.tenantId -> tenant.id, so after tenants.
  //    saveTenantUser (repo line 742 -> Prisma line 1954).
  for (const user of state.tenantUsers) {
    await repo.saveTenantUser(user);
  }

  // 3. Password credentials — subjectId references the service-admin id and user ids;
  //    write after users. savePasswordCredential (repo line 933 -> Prisma line 2633,
  //    upsert on normalized email).
  for (const credential of state.passwordCredentials) {
    await repo.savePasswordCredential(credential);
  }

  // 4. Password policies — independent, keyed by scope (upsert).
  //    createEmptyIdentityState() seeds one 'service-admin' policy (repository line 5919).
  //    savePasswordPolicy (repo line 941 -> Prisma line 2655).
  for (const policy of state.passwordPolicies) {
    await repo.savePasswordPolicy(policy);
  }

  // 5. RBAC policy versions before grants — FK grant.policyVersionId -> policyVersion.id.
  //    Seeded non-empty by createEmptyIdentityState() (line 5929).
  //    saveRbacPolicyVersion (repo line 798 -> Prisma line 2070) retires other active
  //    versions when status === "active", then upserts on id.
  for (const policyVersion of state.rbacPolicyVersions) {
    await repo.saveRbacPolicyVersion(policyVersion);
  }
  //    grant.roleKey FK-references permission_role.key (canonical key e.g. 'admin', NOT
  //    alias 'owner'); permission_role has no Prisma write path here, so that reference
  //    table must already be seeded by a migration or recordRbacRoleGrant will FK-crash.
  //    recordRbacRoleGrant (repo line 802 -> Prisma line 2086).
  for (const grant of state.rbacRoleGrants) {
    await repo.recordRbacRoleGrant(grant);
  }

  // 6. SSO provider configs — empty in the demo fixture, written if present (upsert on providerId).
  //    saveOidcProviderConfig (repo line 953 -> Prisma line 2680);
  //    saveSamlProviderMetadata (repo line 969 -> Prisma line 2769).
  for (const config of state.oidcProviderConfigs) {
    await repo.saveOidcProviderConfig(config);
  }
  for (const metadata of state.samlProviderMetadata) {
    await repo.saveSamlProviderMetadata(metadata);
  }
}

async function seedBilling(repo: BillingRepository, state: BillingState): Promise<void> {
  // FK/dependency order. Only methods that exist on BillingRepository are called.
  // NOTE: state.tariffs is intentionally skipped (Prisma adapter serves tariffs from the
  // static billingTariffCatalog, not Postgres). state.invoices, state.subscriptions,
  // state.billingSyncJobs and state.billingProviderSyncEvents have NO standalone public
  // writer on the repo and cannot be seeded here — see `gaps` (need raw SQL / client delegates).

  // 1. tenants first — parent row referenced by everything below.
  for (const tenant of state.tenants ?? []) {
    await repo.saveTenant(tenant);
  }

  // 2. legal entities before tax documents (documents reference legalEntityId).
  for (const entity of state.billingLegalEntities ?? []) {
    await repo.saveBillingLegalEntity(entity);
  }
  for (const document of state.billingTaxDocuments ?? []) {
    await repo.saveBillingTaxDocument(document);
  }

  // 3. approvals.
  for (const approval of state.billingApprovals ?? []) {
    await repo.saveBillingApproval(approval);
  }

  // 4. payment retry schedules before retry keys (keys may carry scheduleId).
  for (const schedule of state.paymentRetrySchedules ?? []) {
    await repo.savePaymentRetrySchedule(schedule);
  }
  for (const key of state.paymentRetryKeys ?? []) {
    await repo.savePaymentRetryKey(key);
  }

  // 5. dunning states.
  for (const dunning of state.paymentDunningStates ?? []) {
    await repo.savePaymentDunningState(dunning);
  }

  // 6. reconciliation conflicts.
  for (const conflict of state.reconciliationConflicts ?? []) {
    await repo.saveReconciliationConflict(conflict);
  }

  // 7. quota reservations then ledger entries.
  for (const reservation of state.quotaReservations ?? []) {
    await repo.createQuotaReservation(reservation);
  }
  for (const entry of state.quotaLedgerEntries ?? []) {
    await repo.recordQuotaLedgerEntry(entry);
  }
}

async function seedWorkspace(repo, state) {
  // Client profiles first — merge events/conflicts reference their ids.
  for (const profile of state.clientProfiles) {
    await repo.saveClientProfile(profile);
  }
  for (const event of state.clientMergeEvents) {
    await repo.saveClientMergeEvent(event);
  }
  for (const conflict of state.clientMergeConflicts) {
    await repo.saveClientMergeConflict(conflict);
  }
  for (const job of state.clientExportJobs) {
    await repo.saveClientExportJob(job);
  }

  // Knowledge articles before their draft versions and approval decisions.
  for (const article of state.knowledgeArticles) {
    await repo.saveKnowledgeArticle(article);
  }
  for (const draft of state.knowledgeDraftVersions) {
    await repo.saveKnowledgeDraftVersion(draft);
  }
  for (const decision of state.knowledgeApprovalDecisions) {
    await repo.saveKnowledgeApprovalDecision(decision);
  }

  // Templates before their versions and audit events.
  for (const template of state.templates) {
    await repo.saveTemplate(template);
  }
  for (const version of state.templateVersions) {
    await repo.saveTemplateVersion(version);
  }
  for (const audit of state.templateAuditEvents) {
    await repo.saveTemplateAuditEvent(audit);
  }

  // Files before their scan-result idempotency records (fileId reference).
  for (const file of state.files) {
    await repo.saveFile(file);
  }
  for (const idempotency of state.fileScanResultIdempotency) {
    await repo.saveFileScanResultIdempotency(idempotency);
  }
}

async function seedRouting(repo: RoutingRepository, state: RoutingState): Promise<void> {
  // RoutingRepository has NO per-record writers for conversations, operators,
  // queues, or rescueReportRows — those four collections are persisted only as a
  // JSON blob inside the single `routingStateSnapshot` row. saveState() writes
  // that snapshot AND upserts every side table in FK-safe order in one call:
  //   snapshot(conversations, operators, queues, rescueReportRows)
  //   -> routingJob (jobs)
  //   -> operatorCapacity (operatorCapacities)
  //   -> queueMembership (queueMemberships)
  //   -> routingAnalyticsRow (routingAnalyticsRows)
  //   -> routingRule (routingRules)
  // On a fresh Postgres DB the repo's stateSnapshotVersion is 0, so the snapshot
  // is CREATE-d (version 1); this must run before anything (e.g. the app's
  // hydrateStateSnapshot) has created the "default" snapshot row, or the create
  // would hit a primary-key conflict. One call materialises all 9 collections.
  await repo.saveState(state);
}

async function seedConversation(repo, state, client) {
  // repo is a ConversationRepository built via ConversationRepository.prisma({ client }).
  // state is the bootstrapConversationState() output. Write in FK/dependency order.

  // 1. Conversations (parent rows). saveConversation upserts the conversation AND
  //    replaces its nested messages[] in the same transaction — no separate message writer.
  //    The demo fixture reuses per-conversation local message ids (1,2,3...), which is
  //    fine nested in JSON but violates the global conversation_message.id PK in Postgres.
  //    Nothing references these ids (outbound/receipts are empty in the fixture), so
  //    globalise them by prefixing with the conversation id before persisting.
  for (const conversation of state.conversations ?? []) {
    const messages = (conversation.messages ?? []).map((message: { id: unknown }) => ({ ...message, id: `${conversation.id}:${message.id}` }));
    // Postgres requires closed conversations to carry a resolution_outcome
    // (conversations_closed_resolution_outcome_check); the demo fixture leaves some
    // closed conversations without one, so default them to the legacy_unknown value.
    const resolutionOutcome = conversation.status === "closed" && !conversation.resolutionOutcome
      ? "legacy_unknown"
      : conversation.resolutionOutcome;
    await repo.saveConversation({ ...conversation, messages, resolutionOutcome });
  }

  // botHandoff is a read model assembled from the immutable lifecycle journal;
  // it is intentionally not a column on Conversation. Materialise the catalog
  // handoffs as canonical events so the Prisma-backed smoke app exercises the
  // same read path as bot-runtime reconciliation.
  const handoffEvents = (state.conversations ?? [])
    .filter((conversation: { botHandoff?: unknown }) => conversation.botHandoff)
    .map((conversation: { botHandoff: Record<string, unknown>; id: string; tenantId: string }) => ({
      actorId: null,
      actorName: "Smoke catalog",
      actorType: "system",
      conversationId: conversation.id,
      data: conversation.botHandoff,
      eventType: "bot.handoff.created",
      id: `lifecycle_smoke_handoff_${conversation.id}`,
      ingestedAt: new Date("2024-06-01T00:00:00.000Z"),
      occurredAt: new Date("2024-06-01T00:00:00.000Z"),
      reason: "seeded_bot_handoff",
      schemaVersion: "conversation-lifecycle/v1",
      source: "smoke-catalog",
      sourceEventId: `smoke-handoff:${conversation.id}`,
      tenantId: conversation.tenantId,
      traceId: `trace-smoke-handoff-${conversation.id}`
    }));
  if (handoffEvents.length) {
    await client.conversationLifecycleEvent.createMany({ data: handoffEvents, skipDuplicates: true });
  }

  // 2. Outbox events — must exist before any outbound descriptor that references outboxEventId.
  for (const event of state.outboxEvents ?? []) {
    await repo.enqueueOutboxEvent(event);
  }

  // 3. Outbound descriptors — conversationId + outboxEventId FKs already seeded above.
  //    Outbox already enqueued in step 2, so pass the descriptor alone.
  for (const descriptor of state.outboundDescriptors ?? []) {
    await repo.recordOutboundDescriptor({ descriptor });
  }

  // 4. Inbound events — reference conversationId.
  for (const inboundEvent of state.inboundEvents ?? []) {
    await repo.recordInboundEvent(inboundEvent);
  }

  // 5. Realtime events.
  for (const realtimeEvent of state.realtimeEvents ?? []) {
    await repo.appendRealtimeEvent(realtimeEvent);
  }

  // 6. Delivery receipts.
  for (const receipt of state.deliveryReceipts ?? []) {
    await repo.recordDeliveryReceipt(receipt);
  }

  // NOTE: state.channelCatalog is intentionally NOT persisted — the Prisma adapter
  // has no channel-catalog table/delegate and listChannelCatalog() always returns [].
  // (state.routingAnalyticsRows are absent from the bootstrap output; there is
  // likewise no standalone public Prisma writer for them.)
}

async function seedAutomation(repo, state) {
  // repo was built via AutomationRepository.prisma({ client }); its public
  // methods delegate to the PrismaAutomationRepository adapter (writes Postgres).
  // Prefer the *Async variants: several sync methods throw
  // "prisma_automation_async_required" in the adapter.

  // 1. Bot scenarios (parents) before versions / audit / test-runs.
  //    The demo fixture uses a "test" status that Postgres rejects
  //    (bot_scenarios_status_check allows only draft/published/disabled/archived);
  //    map any out-of-enum status to draft.
  const validScenarioStatuses = new Set(["draft", "published", "disabled", "archived"]);
  for (const scenario of state.botScenarios ?? []) {
    const status = validScenarioStatuses.has(scenario.status) ? scenario.status : "draft";
    await repo.saveBotScenario({ ...scenario, status });
  }

  // 2. Scenario versions (FK: scenarioId).
  for (const version of state.botScenarioVersions ?? []) {
    await repo.saveBotScenarioVersion(version);
  }

  // 2b. Bot runtime instances (FK: pinned scenario version; parent of the step
  //     journal). The repo's only write path is commitBotRuntimeTransitionAsync
  //     (instance + step journal in one transaction), so each demo instance
  //     commits a synthetic seed step with no side effects. Re-runs replay as
  //     duplicates by (tenantId, conversationId, inputEventId).
  for (const instance of state.botRuntimeInstances ?? []) {
    await repo.commitBotRuntimeTransitionAsync({
      instance,
      step: {
        conversationId: instance.conversationId,
        createdAt: instance.createdAt,
        error: null,
        handoffSummary: null,
        id: `${instance.id}_seed_step`,
        inputEvent: { seeded: true },
        inputEventId: `${instance.id}:seed`,
        lifecycleEvent: null,
        nodeId: instance.currentNodeId,
        nodeType: "message",
        outcome: "message",
        runtimeId: instance.id,
        sideEffects: [],
        tenantId: instance.tenantId,
        webhookResponse: null
      }
    });
  }

  // 3. Publish audit events (FK: scenarioId; immutable/RESTRICT).
  for (const event of state.botPublishAuditEvents ?? []) {
    await repo.saveBotPublishAuditEvent(event);
  }

  // 4. Bot test runs (FK: scenarioId) — async only.
  for (const run of state.botTestRuns ?? []) {
    await repo.saveBotTestRunAsync(run);
  }

  // 5. Scenario audit events (FK: scenarioId + tenantId).
  for (const event of state.scenarioAuditEvents ?? []) {
    await repo.saveScenarioAuditEvent(event);
  }

  // 6. Proactive rules (parents) before all proactive* children.
  for (const rule of state.proactiveRules ?? []) {
    await repo.saveProactiveRuleAsync(rule);
  }

  // 7. Execution windows (FK: ruleId).
  for (const window of state.proactiveExecutionWindows ?? []) {
    await repo.saveProactiveExecutionWindowAsync(window);
  }

  // 8. Frequency caps (FK: ruleId).
  for (const cap of state.proactiveFrequencyCaps ?? []) {
    await repo.saveProactiveFrequencyCapAsync(cap);
  }

  // 9. Experiment assignments (FK: ruleId).
  for (const assignment of state.proactiveExperimentAssignments ?? []) {
    await repo.saveProactiveExperimentAssignmentAsync(assignment);
  }

  // 10. Delivery attempts (FK: ruleId; descriptorId is external/conversation).
  for (const attempt of state.proactiveDeliveryAttempts ?? []) {
    await repo.saveProactiveDeliveryAttemptAsync(attempt);
  }

  // 11. Delivery attributions (FK: ruleId; descriptorId external).
  for (const attribution of state.proactiveDeliveryAttributions ?? []) {
    await repo.saveProactiveDeliveryAttributionAsync(attribution);
  }

  // 12. Delivery idempotency keys (FK: ruleId).
  for (const record of state.proactiveDeliveryIdempotencyKeys ?? []) {
    await repo.saveProactiveDeliveryIdempotencyKeyAsync(record);
  }

  // 13. Publish idempotency keys (tenant-scoped, independent).
  for (const record of state.publishIdempotencyKeys ?? []) {
    await repo.savePublishIdempotencyKeyAsync(record);
  }

  // NOT WRITTEN (no Postgres write path — see gaps):
  //   botRuntimeSteps, botRuntimeSideEffects (beyond the synthetic seed steps
  //   from 2b), activeVisitors, rescueChats, workspaceAuditEvents,
  //   workspaceRuntimeMetrics.
  // For the default bootstrapAutomationState() fixture the populated ones among
  // these are workspaceAuditEvents and workspaceRuntimeMetrics, which carry
  // demo data but cannot be persisted via the repo (would need raw SQL /
  // a repo change). The visitor/rescue collections are empty [].
}

async function seedReports(repo, state) {
  // repo built via ReportRepository.prisma({ client }); state = bootstrapReportState() output.
  // ReportRepository.prisma() does NOT accept a seed (PrismaReportRepositoryOptions = { client }),
  // and its InMemoryStore is never flushed to Postgres, so every collection is written explicitly
  // through the repo's public async writers, in FK/dependency order.

  // 1. metric definitions (root) -> metricDefinition.upsert
  for (const metric of state.metricDefinitions) {
    await repo.saveMetricDefinition(metric);
  }

  // 2. metric versions (FK definitionId -> metricDefinitions) -> metricVersion.upsert
  for (const version of state.metricVersions) {
    await repo.saveMetricVersion(version);
  }

  // 3. metric tenant overrides (FK definitionId + metricVersionId) -> metricTenantOverride.upsert
  for (const override of state.metricTenantOverrides) {
    await repo.saveMetricTenantOverride(override);
  }

  // 4. Export jobs are an explicit part of the isolated browser-test seed. The
  // production-like report bootstrap is intentionally empty, while the settings
  // runtime spec needs ready and retryable jobs on every clean database.
  const exportJobs = state.exportJobs.length > 0
    ? state.exportJobs
    : exportJobFixtures.map((job) => ({ ...job, tenantId: "tenant-volga" }));
  for (const job of exportJobs) {
    await repo.saveExportJobAsync(job);
  }

  // 5. idempotency keys (record.jobId -> export job) -> reportIdempotencyKey.upsert
  for (const record of state.idempotencyKeys) {
    await repo.saveIdempotencyKey(record);
  }

  // 6. report file descriptors (descriptor.jobId -> export job) -> reportFileDescriptor.upsert (keyed on jobId)
  for (const descriptor of state.reportFileDescriptors) {
    await repo.saveReportFileDescriptorAsync(descriptor);
  }

  // 7. report notification descriptors (descriptor.exportJobId -> export job) -> reportNotificationDescriptor.upsert (keyed on idempotencyKey)
  for (const descriptor of state.reportNotificationDescriptors) {
    await repo.saveReportNotificationDescriptorAsync(descriptor);
  }

  // 8. export retry audit events: NO standalone writer. The only public prisma path is
  //    saveRetriedExportJobAsync(job, auditEvent), which re-upserts the job (idempotent) then
  //    upserts the audit event. Pair each audit event with the export job whose id === auditEvent.jobId.
  const jobById = new Map(exportJobs.map((job) => [job.id, job]));
  for (const auditEvent of state.exportRetryAuditEvents) {
    const job = jobById.get(auditEvent.jobId);
    if (!job) {
      throw new Error(`report seed: retry audit ${auditEvent.auditId} references unknown jobId ${auditEvent.jobId}`);
    }
    await repo.saveRetriedExportJobAsync(job, auditEvent);
  }

  // 9. report query executions (root) -> reportQueryExecution.upsert
  for (const execution of state.reportQueryExecutions) {
    await repo.saveReportQueryExecutionAsync(execution);
  }

  // 10. saved report templates (root; ownerUserId/tenantId are plain strings, no reports-managed FK) -> savedReportTemplate.upsert
  for (const template of state.savedReportTemplates) {
    await repo.saveSavedReportTemplate(template);
  }

  // 11. scheduled digest descriptors (root) -> scheduledDigestDescriptor.upsert
  //     (period-conflict guard is inert against a fresh empty DB with well-formed seed data)
  for (const descriptor of state.scheduledDigestDescriptors) {
    await repo.saveScheduledDigestDescriptorAsync(descriptor);
  }

  // 12. state.workspace has NO prisma writer (no delegate, no save* method); it is served only from
  //     the InMemoryStore via readWorkspaceCatalog(). It cannot be persisted to Postgres through the
  //     repo — see gaps. Intentionally not seeded.
}

async function seedIntegrations(repo, state) {
  // repo was built via IntegrationRepository.prisma({ client }); every write below
  // routes through the Postgres path. .prisma() does NOT persist its `seed` arg to
  // Postgres (it only seeds the in-memory store that backs readWorkspaceCatalog()),
  // so we replay each State collection through the async prisma writers here, in FK order.

  // 1. Parent: channel connections (referenced by telegram/provider/events/audit/apiKeys).
  for (const connection of state.channelConnections ?? []) {
    await repo.saveChannelConnectionAsync(connection);
  }

  // 2. Direct children of a channel connection.
  for (const telegram of state.telegramConnections ?? []) {
    await repo.saveTelegramConnectionAsync(telegram);
  }
  for (const credential of state.providerConnectionCredentials ?? []) {
    await repo.saveProviderConnectionCredentialAsync(credential);
  }
  for (const event of state.channelConnectionEvents ?? []) {
    await repo.saveChannelConnectionEventAsync(event);
  }
  for (const audit of state.channelConnectionAuditEvents ?? []) {
    await repo.saveChannelConnectionAuditEventAsync(audit);
  }
  // sdkVisitorPresenceSessions: only upsertSdkVisitorPresence exists; it forces
  // connected=true, disconnectedAt=null, regenerates id and drops createdAt/firstSeenAt,
  // so it cannot faithfully restore a disconnected/expired row. Demo fixture defaults
  // this to [] (loop normally empty); included best-effort.
  for (const presence of state.sdkVisitorPresenceSessions ?? []) {
    await repo.upsertSdkVisitorPresence({
      channelConnectionId: presence.channelConnectionId,
      expiresAt: presence.expiresAt,
      lastSeenAt: presence.lastSeenAt,
      pagePath: presence.pagePath,
      pageUrl: presence.pageUrl,
      referrer: presence.referrer,
      sessionKeyHash: presence.sessionKeyHash,
      subjectId: presence.subjectId,
      tenantId: presence.tenantId
    });
  }

  // 3. Public API keys (channelConnectionId is an optional FK). ensurePublicApiKeyReference
  //    persists from the existing keyPreview (savePublicApiKey is unusable: it needs a
  //    rawSecret absent from State). Caveat: it stamps a fresh random secretHash, so the
  //    seeded hash will NOT equal state.secretHash, and it does NOT create a reveal state.
  for (const key of state.publicApiKeys ?? []) {
    await repo.ensurePublicApiKeyReference({
      channelConnectionId: key.channelConnectionId ?? null,
      createdAt: key.createdAt,
      environment: key.environment,
      keyId: key.keyId,
      keyPreview: key.keyPreview,
      name: key.name,
      owner: key.owner,
      scopes: key.scopes,
      status: key.status,
      tenantId: key.tenantId
    });
  }
  // state.publicApiKeyRevealStates: NO standalone public writer — skipped (see gaps).

  // 4. API-key rotation records (reference keyId). Sync saveApiKeyRotationJob throws under
  //    prisma, so use the async variant; saveApiKeyRotationAuditEvent already routes to prisma.
  for (const job of state.apiKeyRotationJobs ?? []) {
    await repo.saveApiKeyRotationJobAsync(job);
  }
  for (const event of state.apiKeyRotationAuditEvents ?? []) {
    await repo.saveApiKeyRotationAuditEvent(event);
  }

  // 5. Webhook endpoints, then delivery journal (endpointId FK), then replay records (deliveryId FK).
  //    saveWebhookEndpointRecord only reaches Postgres if the client exposes the optional
  //    webhookEndpoint delegate; otherwise it lands in the in-memory store.
  for (const endpoint of state.webhookEndpointRecords ?? []) {
    await repo.saveWebhookEndpointRecord(endpoint);
  }
  for (const delivery of state.webhookDeliveryJournal ?? []) {
    await repo.saveWebhookDeliveryJournalEntryAsync(delivery);
  }
  for (const replay of state.webhookReplayJournal ?? []) {
    await repo.saveWebhookReplayAsync(replay);
  }
  for (const audit of state.webhookReplayAuditEvents ?? []) {
    await repo.saveWebhookReplayAuditEventAsync(audit);
  }

  // 6. Public demo requests, then their notification descriptors / audit events (leadId FK).
  for (const request of state.publicDemoRequests ?? []) {
    await repo.savePublicDemoRequestAsync(request);
  }
  for (const descriptor of state.publicDemoRequestNotificationDescriptors ?? []) {
    await repo.savePublicDemoRequestNotificationDescriptorAsync(descriptor);
  }
  for (const audit of state.publicDemoRequestAuditEvents ?? []) {
    await repo.savePublicDemoRequestAuditEventAsync(audit);
  }

  // 7. Security sessions (standalone, no FK).
  for (const session of state.securitySessions ?? []) {
    await repo.saveSecuritySessionAsync(session);
  }

  // state.workspace: catalog is never persisted to Postgres. Pass the full State as the
  // `seed` to IntegrationRepository.prisma({ client, seed: state }) so readWorkspaceCatalog()
  // serves it from the in-memory store. No Postgres writer exists for it.
}

async function seedOperations(repo, state) {
  // NOTE: repo is built via OperationsRepository.prisma({ client }).
  // The 6 catalog collections (backupDrills, deadLetterMessages, deadLetterQueues,
  // loadTestScenarios, migrationCandidates, securityControls) have NO Postgres write
  // method and are intentionally skipped here; they must be supplied via the `seed`
  // arg of .prisma({ client, seed }) (InMemoryStore catalog), not persisted to Postgres.
  // In the default bootstrapOperationsState() fixture every collection below is empty,
  // so these loops are no-ops unless the caller passed base overrides.

  // 1. Idempotency keys (independent)
  for (const record of state.deadLetterReplayIdempotencyKeys) {
    await repo.saveDeadLetterReplayIdempotencyKeyAsync(record);
  }
  for (const record of state.loadTestIdempotencyKeys) {
    await repo.saveLoadTestIdempotencyKeyAsync(record);
  }
  for (const record of state.restoreCheckIdempotencyKeys) {
    await repo.saveRestoreCheckIdempotencyKeyAsync(record);
  }

  // 2. Dead-letter replays before their audit/denial children (keyed by messageId filterKey)
  for (const record of state.deadLetterReplays) {
    await repo.saveDeadLetterReplayAsync(record);
  }
  for (const record of state.deadLetterReplayValidationDenials) {
    await repo.saveDeadLetterReplayValidationDenialAsync(record);
  }
  for (const record of state.deadLetterReplayRequeueAudits) {
    await repo.saveDeadLetterReplayRequeueAuditAsync(record);
  }

  // 3. Load-test runs before their per-run executions/metrics/error summaries (keyed by runId)
  for (const record of state.loadTestRuns) {
    await repo.saveLoadTestRunAsync(record);
  }
  for (const record of state.loadTestRunExecutions) {
    await repo.saveLoadTestRunExecutionAsync(record);
  }
  for (const record of state.loadTestRunMetrics) {
    await repo.saveLoadTestRunMetricsAsync(record);
  }
  for (const record of state.loadTestRunErrorSummaries) {
    await repo.saveLoadTestRunErrorSummaryAsync(record);
  }

  // 4. Migration rollback checks before their results (both carry migrationId as filterKey)
  for (const record of state.migrationRollbackChecks) {
    await repo.saveMigrationRollbackCheckAsync(record);
  }
  for (const record of state.migrationRollbackCheckResults) {
    await repo.saveMigrationRollbackCheckResultAsync(record);
  }

  // 5. Restore checks before postgres/object-storage restore-check results (referencing restoreCheckId)
  for (const record of state.restoreChecks) {
    await repo.saveRestoreCheckAsync(record);
  }
  for (const record of state.postgresRestoreCheckResults) {
    await repo.savePostgresRestoreCheckResultAsync(record);
  }
  for (const record of state.objectStorageRestoreCheckExistenceResults) {
    await repo.saveObjectStorageRestoreCheckExistenceResultAsync(record);
  }
  for (const record of state.objectStorageRestoreCheckChecksumResults) {
    await repo.saveObjectStorageRestoreCheckChecksumResultAsync(record);
  }
  for (const record of state.objectStorageRestoreCheckMetadataResults) {
    await repo.saveObjectStorageRestoreCheckMetadataResultAsync(record);
  }
}

async function seedPlatform(repo, state) {
  // repo = PlatformRepository.prisma({ client, seed: state }) (prismaSeedAccepted is FALSE).
  // NOTE: the 5 catalog collections have NO prisma write method and cannot be
  // persisted here — components, platformTenants, staticMetrics,
  // maintenanceWindows, incidentPostmortems. They are only served from the
  // in-memory seed catalog (readCatalogState -> this.store.read()), so build the
  // repo as PlatformRepository.prisma({ client, seed: state }) to expose them at runtime.

  // 1) Incidents first — referenced by incidentId (comms) and incidentIds (rollups).
  for (const incident of state.incidents) {
    await repo.saveIncidentAsync(incident);
  }

  // 2) Incident communication artifacts (all carry incidentId as filterKey).
  for (const attempt of state.incidentCommunicationAttempts) {
    await repo.saveIncidentCommunicationAttemptAsync(attempt);
  }
  for (const retry of state.incidentCommunicationRetries) {
    await repo.saveIncidentCommunicationRetryAsync(retry);
  }
  for (const deadLetter of state.incidentCommunicationDeadLetters) {
    await repo.saveIncidentCommunicationDeadLetterAsync(deadLetter);
  }

  // 3) Incident idempotency keys.
  for (const record of state.incidentIdempotencyKeys) {
    await repo.saveIncidentIdempotencyKeyAsync(record);
  }

  // 4) Feature flags, then rules referencing them, then outbox.
  for (const flag of state.featureFlags) {
    await repo.saveFeatureFlagAsync(flag);
  }
  for (const rule of state.featureFlagRules) {
    await repo.saveFeatureFlagRuleAsync(rule);
  }
  for (const outbox of state.featureFlagOutbox) {
    await repo.saveFeatureFlagOutboxAsync(outbox);
  }

  // 5) Alerting: routing rules, then acknowledgements.
  for (const rule of state.alertRoutingRules) {
    await repo.saveAlertRoutingRuleAsync(rule);
  }
  for (const ack of state.alertAcknowledgements) {
    await repo.saveAlertAcknowledgementAsync(ack);
  }

  // 6) Telemetry samples, then health rollups (rollups reference incident ids).
  for (const sample of state.telemetrySamples) {
    await repo.saveTelemetrySampleAsync(sample);
  }
  for (const rollup of state.healthRollups) {
    await repo.saveHealthRollupAsync(rollup);
  }

  // 7) Audit + outbox mutation ledger.
  for (const row of state.platformAuditRows) {
    await repo.savePlatformAuditRowAsync(row);
  }
  for (const row of state.platformOutboxRows) {
    await repo.savePlatformOutboxRowAsync(row);
  }
}

async function seedQuality(repo, state) {
  // `repo` is a PrismaQualityRepository built via QualityRepository.prisma({ client }).
  // `state` is bootstrapQualityState() output. tenantId/conversationId on these rows are
  // plain columns (no DB-enforced FK in schema.prisma) — they logically point at rows other
  // seeders (identity/conversation) create, but Postgres will NOT reject them if absent.

  // 1. Quality ratings -> client.qualityRating.create (no enforced FK; independent).
  for (const rating of state.ratings ?? []) {
    await repo.saveQualityRating(rating);
  }

  // 2. Manual QA reviews -> client.manualQaReview.create (no enforced FK; independent).
  for (const review of state.manualQaReviews ?? []) {
    await repo.saveManualQaReview(review);
  }

  // 3. AI scoring audits -> client.aiScoringAudit.create. Kept BEFORE suggestion decisions
  //    for logical parent-before-child ordering (decision.scoringAuditId points here).
  //    NB: schema.prisma declares NO @relation FK, so this order is safe but not required.
  for (const audit of state.aiScoringAudits ?? []) {
    await repo.saveAiScoringAudit(audit);
  }

  // 4. AI suggestion decisions -> client.aiSuggestionDecision.create; after audits.
  //    saveAiSuggestionDecision types lifecycleEvent as REQUIRED, but createPrismaQualityRecord
  //    tolerates undefined at runtime (writes the row alone). bootstrapQualityState always
  //    yields [] here, so this loop is normally a no-op.
  for (const decision of state.aiSuggestionDecisions ?? []) {
    await repo.saveAiSuggestionDecision(decision, undefined);
  }

  // state.workspace (aiCoachingQueue, aiEffectivenessMetrics, aiRealtimeChecks, aiSuggestions,
  // knowledgeArticles, qualityMetrics) has NO Prisma write method and NO Postgres table.
  // PrismaQualityRepository.readWorkspace() just delegates to this.fallback.readWorkspace().
  // To surface it, build the repo with a fallback seeded from bootstrapQualityState():
  //   QualityRepository.prisma({ client, fallback: QualityRepository.inMemory(state) })
  // It cannot be persisted to Postgres through any write method on `repo`.
}

async function seedReferencedSupportQueues(client: never, integrationState: never): Promise<void> {
  // integration_channel_connections.routing_queue_id is a NOT NULL FK to
  // support_queues(tenant_id, id), but routing seeds queues only into its JSON
  // snapshot, never the normalized table. Create the exact queues the demo channel
  // connections reference (default_team_id null → no Team FK) so integrations can seed.
  const queueClient = client as unknown as {
    operatorCapacity: {
      upsert(input: {
        where: { tenantId_operatorId_channel: { tenantId: string; operatorId: string; channel: string } };
        create: { channel: string; chatLimit: number; id: string; operatorId: string; overrideAllowed: boolean; tenantId: string; updatedAt: Date };
        update: { chatLimit: number; overrideAllowed: boolean; updatedAt: Date };
      }): Promise<unknown>;
    };
    queueMembership: {
      upsert(input: {
        where: { tenantId_queueId_operatorId: { tenantId: string; queueId: string; operatorId: string } };
        create: { active: boolean; id: string; operatorId: string; queueId: string; role: string; tenantId: string; updatedAt: Date };
        update: { active: boolean; role: string; updatedAt: Date };
      }): Promise<unknown>;
    };
    supportQueue: {
      upsert(input: {
        where: { tenantId_id: { tenantId: string; id: string } };
        create: { id: string; tenantId: string; name: string; status: string };
        update: Record<string, never>;
      }): Promise<unknown>;
    };
  };
  const state = integrationState as { channelConnections?: Array<{ tenantId?: string; routingQueueId?: string | null }> };
  const seen = new Set<string>();
  for (const connection of state.channelConnections ?? []) {
    const tenantId = connection.tenantId;
    const id = connection.routingQueueId;
    if (!tenantId || !id || seen.has(`${tenantId}:${id}`)) continue;
    seen.add(`${tenantId}:${id}`);
    await queueClient.supportQueue.upsert({
      where: { tenantId_id: { tenantId, id } },
      create: { id, tenantId, name: id, status: "active" },
      update: {}
    });
    if (tenantId === "tenant-volga") {
      const operatorId = "usr-volga-admin";
      const updatedAt = new Date();
      await queueClient.queueMembership.upsert({
        where: { tenantId_queueId_operatorId: { tenantId, queueId: id, operatorId } },
        create: {
          active: true,
          id: `qm-smoke-${id}-${operatorId}`,
          operatorId,
          queueId: id,
          role: "primary",
          tenantId,
          updatedAt
        },
        update: { active: true, role: "primary", updatedAt }
      });
      await queueClient.operatorCapacity.upsert({
        where: { tenantId_operatorId_channel: { tenantId, operatorId, channel: id } },
        create: {
          channel: id,
          chatLimit: 20,
          id: `capacity-smoke-${id}-${operatorId}`,
          operatorId,
          overrideAllowed: true,
          tenantId,
          updatedAt
        },
        update: { chatLimit: 20, overrideAllowed: true, updatedAt }
      });
    }
  }
}

async function main(): Promise<void> {
  const client = createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) as never;
  const seeds = createLocalDevelopmentRepositorySeeds();
  const failures: string[] = [];
  const describe = (error: unknown): string => {
    const e = error as { code?: string; meta?: unknown; message?: string; stack?: string };
    const base = e.code ? `${e.code} ${JSON.stringify(e.meta ?? {})}` : String(e.message ?? error);
    const raw = base && base.trim() ? base : String(e.stack ?? error);
    return raw.replace(/\s+/g, " ").slice(0, 320);
  };
  try { await seedWorkspace(WorkspaceRepository.prisma({ client }) as never, seeds.workspace as never); console.log("  ok workspace"); }
  catch (error) { failures.push("workspace: " + describe(error)); console.log("  FAIL workspace"); }
  try { await seedRouting(RoutingRepository.prisma({ client }) as never, seeds.routing as never); console.log("  ok routing"); }
  catch (error) { failures.push("routing: " + describe(error)); console.log("  FAIL routing"); }
  try { await seedReferencedSupportQueues(client, seeds.integrations as never); } catch (error) { failures.push("support-queues: " + describe(error)); }
  try { await seedConversation(ConversationRepository.prisma({ client }) as never, seeds.conversation as never, client); console.log("  ok conversation"); }
  catch (error) { failures.push("conversation: " + describe(error)); console.log("  FAIL conversation"); }
  try { await seedAutomation(AutomationRepository.prisma({ client }) as never, seeds.automation as never); console.log("  ok automation"); }
  catch (error) { failures.push("automation: " + describe(error)); console.log("  FAIL automation"); }
  try { await seedReports(ReportRepository.prisma({ client }) as never, seeds.reports as never); console.log("  ok reports"); }
  catch (error) { failures.push("reports: " + describe(error)); console.log("  FAIL reports"); }
  try { await seedIntegrations(IntegrationRepository.prisma({ client }) as never, seeds.integrations as never); console.log("  ok integrations"); }
  catch (error) { failures.push("integrations: " + describe(error)); console.log("  FAIL integrations"); }
  try { await seedOperations(OperationsRepository.prisma({ client }) as never, seeds.operations as never); console.log("  ok operations"); }
  catch (error) { failures.push("operations: " + describe(error)); console.log("  FAIL operations"); }
  try { await seedPlatform(PlatformRepository.prisma({ client }) as never, seeds.platform as never); console.log("  ok platform"); }
  catch (error) { failures.push("platform: " + describe(error)); console.log("  FAIL platform"); }
  try { await seedQuality(QualityRepository.prisma({ client }) as never, seeds.quality as never); console.log("  ok quality"); }
  catch (error) { failures.push("quality: " + describe(error)); console.log("  FAIL quality"); }
  if (failures.length) { console.log(""); console.log("seed failures:"); for (const x of failures) console.log("  - " + x); }
  process.exit(0);
}
main().catch((error) => { console.error(error); process.exit(1); });
