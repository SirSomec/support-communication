import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProactiveExposureRepository } from "../apps/api-gateway/src/automation/proactive-exposure.repository.ts";
import { handlePublicSdkInvitationAcknowledge, handlePublicSdkInvitationPoll } from "../apps/api-gateway/src/integrations/public-sdk-invitations.route.ts";
import { hashPublicApiKeySecret } from "../apps/api-gateway/src/integrations/public-api-auth.ts";
import { IntegrationRepository } from "../apps/api-gateway/src/integrations/integration.repository.ts";
import { scopedSdkPresenceHash } from "../apps/api-gateway/src/integrations/public-sdk-presence.route.ts";

describe("durable proactive SDK exposure lifecycle", () => {
  it("polls only the exact live tenant session and acknowledges lifecycle idempotently", async () => {
    const tenantId = "tenant-exposure";
    const connectionId = "sdk-connection";
    const sessionId = "browser-tab-1";
    const now = "2026-07-11T10:00:00.000Z";
    const integrations = IntegrationRepository.inMemory();
    const presence = await integrations.upsertSdkVisitorPresence({ channelConnectionId: connectionId,
      expiresAt: "2026-07-11T10:02:00.000Z", lastSeenAt: now, pagePath: "/checkout", pageUrl: null, referrer: null,
      sessionKeyHash: scopedSdkPresenceHash(tenantId, connectionId, sessionId), subjectId: "subject-hash", tenantId });
    const exposures = ProactiveExposureRepository.inMemory();
    const planned = await exposures.createPlanned({ channelConnectionId: connectionId, experimentId: "exp-rule",
      experimentVersion: "v1", message: "Can we help?", occurrenceKey: "2026-07-11T10", plannedAt: now,
      presenceSessionId: presence.id, ruleId: "rule", segmentSnapshot: { page: "/checkout" }, subjectId: presence.subjectId,
      tenantId, variant: "B" });
    const key = "sdk-public-secret";
    const lookup = { listActiveKeys: () => [{ channelConnectionId: connectionId, environment: "stage" as const,
      keyId: "key-1", scopes: ["clients:identify"], secretHash: hashPublicApiKeySecret(key), status: "active" as const, tenantId }] };
    const base = { authorization: `Bearer ${key}`, environment: "stage" as const, exposureRepository: exposures,
      integrationRepository: integrations, lookup, now, sessionId };

    const poll = await handlePublicSdkInvitationPoll(base);
    const shown = await handlePublicSdkInvitationAcknowledge({ ...base, action: "shown", exposureId: planned.exposure.exposureId });
    const shownReplay = await handlePublicSdkInvitationAcknowledge({ ...base, action: "shown", exposureId: planned.exposure.exposureId });
    let createCalls = 0;
    const accepted = await handlePublicSdkInvitationAcknowledge({ ...base, action: "accepted",
      exposureId: planned.exposure.exposureId, onAccepted: async () => { createCalls += 1; return "sdk-conversation"; } });
    const acceptedReplay = await handlePublicSdkInvitationAcknowledge({ ...base, action: "accepted",
      exposureId: planned.exposure.exposureId, onAccepted: async () => { createCalls += 1; return "sdk-other"; } });

    assert.equal((poll.data.invitations as unknown[]).length, 1);
    assert.equal(shown.data.status, "shown");
    assert.equal(shownReplay.data.status, "shown");
    assert.equal(accepted.data.status, "accepted");
    assert.equal(acceptedReplay.data.status, "accepted");
    assert.equal(createCalls, 1);
    assert.equal(accepted.data.conversationId, "sdk-conversation");
    assert.deepEqual(accepted.data.attribution, { experimentId: "exp-rule", experimentVersion: "v1",
      exposureId: planned.exposure.exposureId, ruleId: "rule", variant: "B" });
    assert.equal((await handlePublicSdkInvitationPoll(base)).data.invitations instanceof Array, true);
    assert.equal(((await handlePublicSdkInvitationPoll(base)).data.invitations as unknown[]).length, 0);
  });

  it("uses occurrence keys instead of lifetime-once uniqueness", async () => {
    const repository = ProactiveExposureRepository.inMemory();
    const base = { channelConnectionId: "conn", experimentId: "exp", experimentVersion: "v1", message: "Help",
      plannedAt: "2026-07-11T10:00:00.000Z", presenceSessionId: "presence", ruleId: "rule", segmentSnapshot: {},
      subjectId: "subject", tenantId: "tenant", variant: "A" };
    const first = await repository.createPlanned({ ...base, occurrenceKey: "2026-07-11T10" });
    const replay = await repository.createPlanned({ ...base, occurrenceKey: "2026-07-11T10" });
    const next = await repository.createPlanned({ ...base, occurrenceKey: "2026-07-11T11", plannedAt: "2026-07-11T11:00:00.000Z" });
    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(next.created, true);
  });

  it("rejects another session and tenant", async () => {
    const repository = ProactiveExposureRepository.inMemory();
    const planned = await repository.createPlanned({ channelConnectionId: "conn", experimentId: "exp", experimentVersion: "v1",
      message: "Help", occurrenceKey: "period", plannedAt: "2026-07-11T10:00:00.000Z", presenceSessionId: "session-a",
      ruleId: "rule", segmentSnapshot: {}, subjectId: "subject", tenantId: "tenant-a", variant: "A" });
    assert.equal(await repository.transition({ at: "2026-07-11T10:01:00.000Z", exposureId: planned.exposure.exposureId,
      presenceSessionId: "session-b", status: "shown", tenantId: "tenant-a" }), null);
    assert.equal(await repository.transition({ at: "2026-07-11T10:01:00.000Z", exposureId: planned.exposure.exposureId,
      presenceSessionId: "session-a", status: "shown", tenantId: "tenant-b" }), null);
  });

  it("attributes one in-window visitor message and produces tenant-isolated zero-safe metrics", async () => {
    const repository = ProactiveExposureRepository.inMemory();
    const planned = await repository.createPlanned({ channelConnectionId: "conn", experimentId: "exp", experimentVersion: "v2",
      message: "Help", occurrenceKey: "period", plannedAt: "2026-07-01T10:00:00.000Z", presenceSessionId: "session",
      ruleId: "rule", segmentSnapshot: {}, subjectId: "subject", tenantId: "tenant-a", variant: "B" });
    await repository.markDelivered({ at: "2026-07-01T10:01:00.000Z", exposureId: planned.exposure.exposureId,
      presenceSessionId: "session", tenantId: "tenant-a" });
    await repository.transition({ at: "2026-07-01T10:02:00.000Z", exposureId: planned.exposure.exposureId,
      presenceSessionId: "session", status: "shown", tenantId: "tenant-a" });
    await repository.transition({ at: "2026-07-01T10:03:00.000Z", conversationId: "sdk-conversation",
      exposureId: planned.exposure.exposureId, presenceSessionId: "session", status: "accepted", tenantId: "tenant-a" });

    const converted = await repository.recordMessageConversion({ conversationId: "sdk-conversation", messageId: "message-1",
      occurredAt: "2026-07-02T10:03:00.000Z", tenantId: "tenant-a" });
    const replay = await repository.recordMessageConversion({ conversationId: "sdk-conversation", messageId: "message-2",
      occurredAt: "2026-07-02T10:04:00.000Z", tenantId: "tenant-a" });
    const outsideWindow = await repository.recordMessageConversion({ conversationId: "sdk-conversation", messageId: "message-3",
      occurredAt: "2026-07-09T10:03:00.001Z", tenantId: "tenant-a" });
    const metrics = await repository.aggregateMetrics({ from: "2026-07-01T00:00:00.000Z", ruleVariants: [{ ruleId: "rule", variant: "B" }],
      tenantId: "tenant-a", to: "2026-07-08T23:59:59.999Z" });
    const foreignMetrics = await repository.aggregateMetrics({ from: "2026-07-01T00:00:00.000Z", ruleVariants: [{ ruleId: "rule", variant: "B" }],
      tenantId: "tenant-b", to: "2026-07-08T23:59:59.999Z" });

    assert.equal(converted?.exposureId, planned.exposure.exposureId);
    assert.equal(replay?.conversionId, converted?.conversionId);
    assert.equal(outsideWindow, null);
    assert.deepEqual(metrics[0]?.counts, { accepted: 1, converted: 1, delivered: 1, dismissed: 0, eligible: 1, planned: 1, shown: 1 });
    assert.equal(metrics[0]?.rates.conversionRate, 1);
    assert.deepEqual(foreignMetrics[0]?.counts, { accepted: 0, converted: 0, delivered: 0, dismissed: 0, eligible: 0, planned: 0, shown: 0 });
  });
});
