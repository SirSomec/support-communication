import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { RealtimeEvent } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { OperatorPresenceRepository } from "../apps/api-gateway/src/presence/operator-presence.repository.ts";
import {
  OPERATOR_PRESENCE_STATUSES,
  isOperatorPresenceStatus,
  presenceAcceptsAutoAssignment,
  presenceAcceptsManualAssignment
} from "../apps/api-gateway/src/presence/operator-presence.types.ts";
import { OperatorPresenceService } from "../apps/api-gateway/src/presence/presence.service.ts";
import { bootstrapRoutingState } from "../apps/api-gateway/src/routing/seed.ts";
import { RoutingRepository } from "../apps/api-gateway/src/routing/routing.repository.ts";
import { RoutingService } from "../apps/api-gateway/src/routing/routing.service.ts";

const TENANT = "tenant-volga";
const VOLGA_CONTEXT = { tenantId: TENANT };

function operatorContext(actorId: string) {
  return { actorId, actorType: "operator" as const, tenantId: TENANT };
}

function createIdentityStub(users: Array<{ id: string; name: string; role?: string; status?: string }>) {
  return {
    async findTenantUsers() {
      return users.map((user) => ({
        device: "desktop",
        email: `${user.id}@example.com`,
        id: user.id,
        inviteStatus: "accepted",
        lastActiveAt: null,
        mfa: "none",
        name: user.name,
        risk: "low",
        role: user.role ?? "Оператор",
        sessions: 1,
        status: user.status ?? "active",
        supportNotes: "",
        tenantId: TENANT
      }));
    }
  };
}

function createRealtimeSinks() {
  const appended: RealtimeEvent[] = [];
  const published: RealtimeEvent[] = [];
  return {
    appended,
    conversationRepository: {
      async appendRealtimeEvent(event: RealtimeEvent) {
        appended.push(event);
        return event;
      }
    },
    published,
    realtimeFanout: {
      async publish(event: RealtimeEvent) {
        published.push(event);
      },
      async subscribe() {
        return () => {};
      }
    }
  };
}

describe("operator presence contracts (FR §9.4, §12.3)", () => {
  describe("repository", () => {
    it("opens the first interval and reads it back as the current status", async () => {
      const repository = OperatorPresenceRepository.inMemory();

      const result = await repository.setStatus({ operatorId: "operator-anna", status: "online", tenantId: TENANT });

      assert.equal(result.changed, true);
      assert.equal(result.previous, null);
      assert.equal(result.current.status, "online");

      const current = await repository.findCurrent(TENANT, "operator-anna");
      assert.equal(current?.status, "online");
      assert.equal(current?.since, result.current.since);
      assert.deepEqual((await repository.listCurrent(TENANT)).map((record) => record.operatorId), ["operator-anna"]);
    });

    it("closes the previous interval on status change and keeps same-status writes idempotent", async () => {
      const repository = OperatorPresenceRepository.inMemory();
      const startedAt = new Date("2026-07-13T08:00:00.000Z");
      const switchedAt = new Date("2026-07-13T08:10:00.000Z");

      await repository.setStatus({ at: startedAt, operatorId: "operator-anna", status: "online", tenantId: TENANT });
      const change = await repository.setStatus({ at: switchedAt, operatorId: "operator-anna", status: "break", tenantId: TENANT });
      const repeat = await repository.setStatus({ operatorId: "operator-anna", status: "break", tenantId: TENANT });

      assert.equal(change.changed, true);
      assert.equal(change.previous?.status, "online");
      assert.equal(repeat.changed, false);

      const intervals = await repository.listIntervalsInRange(TENANT, {
        from: new Date("2026-07-13T00:00:00.000Z"),
        to: new Date("2026-07-14T00:00:00.000Z")
      });
      assert.equal(intervals.length, 2);
      assert.equal(intervals.filter((interval) => interval.endedAt === null).length, 1);
      assert.equal(intervals.find((interval) => interval.status === "online")?.endedAt, switchedAt.toISOString());
    });

    it("scopes reads by tenant and rejects unsupported statuses", async () => {
      const repository = OperatorPresenceRepository.inMemory();
      await repository.setStatus({ operatorId: "operator-anna", status: "online", tenantId: TENANT });

      assert.deepEqual(await repository.listCurrent("tenant-other"), []);
      assert.equal(await repository.findCurrent("tenant-other", "operator-anna"), null);
      assert.throws(
        () => repository.setStatus({ operatorId: "operator-anna", status: "away" as never, tenantId: TENANT }),
        TypeError
      );
    });

    it("persists intervals across reopenings of the json store", async () => {
      const filePath = join(tmpdir(), `operator-presence-${randomUUID()}.json`);
      try {
        const repository = OperatorPresenceRepository.open({ filePath });
        await repository.setStatus({ operatorId: "operator-anna", status: "busy", tenantId: TENANT });

        const reopened = OperatorPresenceRepository.open({ filePath });
        assert.equal((await reopened.findCurrent(TENANT, "operator-anna"))?.status, "busy");
      } finally {
        rmSync(filePath, { force: true });
      }
    });
  });

  describe("status catalog", () => {
    it("models the six FR §9.4 statuses with routing effects", () => {
      assert.deepEqual(
        OPERATOR_PRESENCE_STATUSES.map((status) => status.key),
        ["online", "busy", "wrapping_up", "break", "unavailable", "offline"]
      );
      assert.equal(OPERATOR_PRESENCE_STATUSES.filter((status) => status.acceptsAutoAssignment).length, 1);
      assert.ok(presenceAcceptsAutoAssignment("online"));
      assert.ok(!presenceAcceptsAutoAssignment("busy"));
      assert.ok(presenceAcceptsManualAssignment("busy"));
      assert.ok(presenceAcceptsManualAssignment("wrapping_up"));
      assert.ok(!presenceAcceptsManualAssignment("break"));
      assert.ok(!presenceAcceptsManualAssignment("offline"));
      assert.ok(isOperatorPresenceStatus("unavailable"));
      assert.ok(!isOperatorPresenceStatus("away"));
    });
  });

  describe("presence service", () => {
    it("stores own status and emits the operator.presence.updated realtime event", async () => {
      const sinks = createRealtimeSinks();
      const service = new OperatorPresenceService({
        conversationRepository: sinks.conversationRepository,
        identityRepository: createIdentityStub([{ id: "operator-anna", name: "Anna R." }]),
        presenceRepository: OperatorPresenceRepository.inMemory(),
        realtimeFanout: sinks.realtimeFanout
      });

      const initial = await service.fetchMyPresence(operatorContext("operator-anna"));
      assert.equal(initial.status, "ok");
      assert.equal(initial.data.presence, null);
      assert.ok(Array.isArray(initial.data.statuses));

      const updated = await service.setMyPresence({ status: "break" }, operatorContext("operator-anna"));
      assert.equal(updated.status, "ok");
      assert.equal(updated.data.changed, true);
      assert.equal((updated.data.presence as { status: string }).status, "break");
      assert.equal(sinks.appended.length, 1);
      assert.equal(sinks.appended[0].eventName, "operator.presence.updated");
      assert.equal(sinks.appended[0].tenantId, TENANT);
      assert.equal(sinks.appended[0].data.operatorName, "Anna R.");
      assert.equal(sinks.published.length, 1);

      const repeated = await service.setMyPresence({ status: "break" }, operatorContext("operator-anna"));
      assert.equal(repeated.data.changed, false);
      assert.equal(repeated.data.realtimeEvent, null);
      assert.equal(sinks.appended.length, 1);
    });

    it("rejects unsupported statuses and non-operator actors", async () => {
      const service = new OperatorPresenceService({
        conversationRepository: createRealtimeSinks().conversationRepository,
        identityRepository: createIdentityStub([]),
        presenceRepository: OperatorPresenceRepository.inMemory(),
        realtimeFanout: createRealtimeSinks().realtimeFanout
      });

      const invalid = await service.setMyPresence({ status: "away" }, operatorContext("operator-anna"));
      assert.equal(invalid.status, "invalid");
      assert.equal(invalid.error?.code, "presence_status_unsupported");

      const denied = await service.setMyPresence({ status: "online" }, {
        actorId: "svc-admin-001",
        actorType: "service_admin",
        tenantId: TENANT
      });
      assert.equal(denied.status, "denied");
      assert.equal(denied.error?.code, "operator_context_required");

      const missingTenant = await service.fetchMyPresence({ actorId: "operator-anna", actorType: "operator" });
      assert.equal(missingTenant.status, "invalid");
      assert.equal(missingTenant.error?.code, "tenant_context_required");
    });

    it("summarizes team statuses with time-in-status totals for the requested window", async () => {
      const presenceRepository = OperatorPresenceRepository.inMemory();
      const rangeStart = new Date("2026-07-13T08:00:00.000Z");
      await presenceRepository.setStatus({ at: rangeStart, operatorId: "operator-anna", status: "online", tenantId: TENANT });
      await presenceRepository.setStatus({
        at: new Date("2026-07-13T08:10:00.000Z"),
        operatorId: "operator-anna",
        status: "break",
        tenantId: TENANT
      });

      const service = new OperatorPresenceService({
        conversationRepository: createRealtimeSinks().conversationRepository,
        identityRepository: createIdentityStub([
          { id: "operator-anna", name: "Anna R.", role: "Оператор" },
          { id: "operator-ivan", name: "Ivan P.", role: "Старший смены" }
        ]),
        presenceRepository,
        realtimeFanout: createRealtimeSinks().realtimeFanout
      });

      const envelope = await service.fetchTeamPresence({
        from: rangeStart.toISOString(),
        to: "2026-07-13T08:15:00.000Z"
      }, operatorContext("operator-ivan"));

      assert.equal(envelope.status, "ok");
      const operators = envelope.data.operators as Array<Record<string, unknown>>;
      assert.deepEqual(operators.map((operator) => operator.operatorId), ["operator-anna", "operator-ivan"]);

      const anna = operators[0] as { seconds: Record<string, number>; since: string; status: string; trackedSeconds: number };
      assert.equal(anna.status, "break");
      assert.equal(anna.seconds.online, 600);
      assert.equal(anna.seconds.break, 300);
      assert.equal(anna.trackedSeconds, 900);
      assert.equal(anna.since, "2026-07-13T08:10:00.000Z");

      const ivan = operators[1] as { status: string | null; trackedSeconds: number };
      assert.equal(ivan.status, null);
      assert.equal(ivan.trackedSeconds, 0);

      const invalidRange = await service.fetchTeamPresence({ from: "not-a-date" }, operatorContext("operator-ivan"));
      assert.equal(invalidRange.status, "invalid");
      assert.equal(invalidRange.error?.code, "presence_range_invalid");
    });
  });

  describe("routing distribution honors operator presence", () => {
    let presenceRepository: OperatorPresenceRepository;
    let routing: RoutingService;

    beforeEach(() => {
      RoutingRepository.useDefault(RoutingRepository.inMemory(bootstrapRoutingState()));
      presenceRepository = OperatorPresenceRepository.inMemory();
      routing = new RoutingService(undefined, undefined, undefined, undefined, presenceRepository);
    });

    afterEach(() => {
      RoutingRepository.clearDefault();
    });

    it("excludes operators whose selected status pauses auto-assignment", async () => {
      await presenceRepository.setStatus({ operatorId: "operator-anna", status: "busy", tenantId: TENANT });

      const simulation = await routing.simulateAssignment({ conversationId: "alexey" }, VOLGA_CONTEXT);
      const anna = (simulation.data.candidates as Array<Record<string, unknown>>).find((candidate) => candidate.operatorId === "operator-anna");
      assert.equal(anna?.status, "busy");
      assert.equal(anna?.recommendation, "blocked");
      assert.ok((anna?.explain as string[]).includes("presence:operator_presence"));

      const preview = await routing.previewRedistribution({
        idempotencyKey: "presence_busy_preview",
        reason: "Presence gating preview",
        selectedQueues: ["VK"],
        targetRule: "least_loaded"
      }, VOLGA_CONTEXT);
      assert.deepEqual(preview.data.plan, []);
      assert.equal((preview.data.capacityConflicts as unknown[]).length, 1);
    });

    it("distributes queued dialogs again after the operator returns to the online status", async () => {
      await presenceRepository.setStatus({ operatorId: "operator-anna", status: "break", tenantId: TENANT });
      const blocked = await routing.previewRedistribution({
        idempotencyKey: "presence_break_preview",
        reason: "Presence gating preview",
        selectedQueues: ["VK"],
        targetRule: "least_loaded"
      }, VOLGA_CONTEXT);
      assert.deepEqual(blocked.data.plan, []);

      await presenceRepository.setStatus({ operatorId: "operator-anna", status: "online", tenantId: TENANT });
      const allowed = await routing.previewRedistribution({
        idempotencyKey: "presence_online_preview",
        reason: "Presence gating preview",
        selectedQueues: ["VK"],
        targetRule: "least_loaded"
      }, VOLGA_CONTEXT);
      const plan = allowed.data.plan as Array<{ conversationId: string; targetOperatorId: string }>;
      assert.equal(plan.length, 1);
      assert.equal(plan[0].conversationId, "alexey");
      assert.equal(plan[0].targetOperatorId, "operator-anna");
    });

    it("allows manual assignment to busy operators but denies paused statuses", async () => {
      await presenceRepository.setStatus({ operatorId: "operator-anna", status: "busy", tenantId: TENANT });
      const manualToBusy = await routing.createAssignment({
        action: "assign",
        conversationId: "alexey",
        reason: "Senior override for the busy operator",
        targetOperatorId: "operator-anna"
      }, VOLGA_CONTEXT);
      assert.equal(manualToBusy.status, "ok");
      assert.equal((manualToBusy.data.assignment as { targetOperatorId: string }).targetOperatorId, "operator-anna");

      await presenceRepository.setStatus({ operatorId: "operator-ivan", status: "break", tenantId: TENANT });
      const manualToBreak = await routing.createAssignment({
        action: "assign",
        conversationId: "vladimir",
        reason: "Manual transfer to the resting operator",
        targetOperatorId: "operator-ivan"
      }, VOLGA_CONTEXT);
      assert.equal(manualToBreak.status, "denied");
      assert.equal(manualToBreak.error?.code, "operator_unavailable");
      assert.equal(manualToBreak.data.operatorStatus, "break");
    });

    it("overlays presence statuses and time-in-status onto the workload read", async () => {
      await presenceRepository.setStatus({ operatorId: "operator-kirill", status: "online", tenantId: TENANT });
      await presenceRepository.setStatus({ operatorId: "operator-ivan", status: "wrapping_up", tenantId: TENANT });

      const workload = await routing.fetchWorkload({ channel: "Telegram" }, VOLGA_CONTEXT);
      const operators = workload.data.operators as Array<Record<string, unknown>>;
      const kirill = operators.find((operator) => operator.id === "operator-kirill");
      const ivan = operators.find((operator) => operator.id === "operator-ivan");

      assert.equal(kirill?.status, "online");
      assert.equal(kirill?.presenceSource, "operator_presence");
      assert.equal(typeof kirill?.presenceSince, "string");
      assert.equal(ivan?.status, "wrapping_up");
      assert.equal((workload.data.totals as { onlineOperators: number }).onlineOperators, 1);
    });
  });

  describe("runtime wiring", () => {
    it("bootstraps the presence repository in the api-gateway and the polling auto-assignment worker", () => {
      const mainSource = readFileSync(new URL("../apps/api-gateway/src/main.ts", import.meta.url), "utf8");
      assert.match(mainSource, /configureOperatorPresenceRepository\(config\)/);
      assert.match(mainSource, /OperatorPresenceService\.configureRealtimeFanoutFromEnv/);

      const pollingSource = readFileSync(new URL("../apps/api-gateway/src/integrations/telegram-polling.main.ts", import.meta.url), "utf8");
      assert.match(pollingSource, /configureOperatorPresenceRepository\(source\)/);

      const configSource = readFileSync(new URL("../packages/config/src/index.ts", import.meta.url), "utf8");
      assert.match(configSource, /PRESENCE_REPOSITORY/);
      assert.match(configSource, /"PRESENCE_REPOSITORY",/);
    });

    it("grants presence actions to the seeded tenant roles", async () => {
      const { permissionRoles } = await import("../apps/api-gateway/src/identity/seed-catalog.ts");
      const employee = permissionRoles.find((role) => role.key === "employee");
      const senior = permissionRoles.find((role) => role.key === "senior");

      assert.ok(employee?.actions.includes("presence.write"));
      assert.ok(!employee?.actions.includes("presence.read"));
      assert.ok(senior?.actions.includes("presence.write"));
      assert.ok(senior?.actions.includes("presence.read"));
    });

    it("keeps presence stores out of shared runtime defaults in the playwright gateway", () => {
      const playwrightGateway = readFileSync(new URL("../../tests/playwright-api-gateway.mjs", import.meta.url), "utf8");
      assert.match(playwrightGateway, /PRESENCE_STORE_FILE/);
      assert.equal(existsSync(new URL("../apps/api-gateway/src/presence/bootstrap.ts", import.meta.url)), true);
    });
  });
});
