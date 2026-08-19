import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { RealtimeEvent } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import {
  CurrentShiftRepository,
  type PrismaCurrentShiftRow
} from "../apps/api-gateway/src/shifts/current-shift.repository.ts";
import { CurrentShiftService, SHIFT_UPDATED_EVENT } from "../apps/api-gateway/src/shifts/current-shift.service.ts";

const TENANT = "tenant-volga";

function createIdentityStub(users: Array<{ id: string; status?: string; tenantId?: string }>) {
  return {
    async findTenantUsers() {
      return users.map((user) => ({
        device: "desktop",
        email: `${user.id}@example.com`,
        id: user.id,
        inviteStatus: "accepted",
        lastActiveAt: null,
        mfa: "none",
        name: user.id,
        risk: "low",
        role: "Оператор",
        sessions: 1,
        status: user.status ?? "active",
        supportNotes: "",
        tenantId: user.tenantId ?? TENANT
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
        return { channel: null, status: "skipped" as const, subscribers: 0 };
      },
      async subscribe() {
        return { async close() {}, status: "disabled" as const };
      }
    }
  };
}

describe("current shift contracts", () => {
  describe("repository", () => {
    it("stores exactly one current shift per tenant and isolates reads", async () => {
      const repository = CurrentShiftRepository.inMemory();
      const first = await repository.saveCurrent({
        endsAt: new Date("2026-08-20T17:00:00.000Z"),
        name: "Дневная смена",
        operatorIds: ["operator-anna"],
        startsAt: new Date("2026-08-20T09:00:00.000Z"),
        tenantId: TENANT,
        updatedAt: new Date("2026-08-20T08:00:00.000Z")
      });
      const second = await repository.saveCurrent({
        endsAt: new Date("2026-08-20T21:00:00.000Z"),
        name: "Вечерняя смена",
        operatorIds: ["operator-anna", "operator-ivan"],
        startsAt: new Date("2026-08-20T13:00:00.000Z"),
        tenantId: TENANT,
        updatedAt: new Date("2026-08-20T12:00:00.000Z")
      });

      assert.equal(first.name, "Дневная смена");
      assert.equal((await repository.findCurrent(TENANT))?.name, "Вечерняя смена");
      assert.deepEqual(second.operatorIds, ["operator-anna", "operator-ivan"]);
      assert.equal(await repository.findCurrent("tenant-other"), null);
    });

    it("uses a tenant-keyed Prisma upsert", async () => {
      const rows = new Map<string, PrismaCurrentShiftRow>();
      const upserts: Array<Record<string, unknown>> = [];
      const client = {
        currentShift: {
          async findUnique({ where }: { where: { tenantId: string } }) {
            return rows.get(where.tenantId) ?? null;
          },
          async upsert(input: {
            create: PrismaCurrentShiftRow;
            update: Omit<PrismaCurrentShiftRow, "tenantId">;
            where: { tenantId: string };
          }) {
            upserts.push(input);
            const saved = {
              ...(rows.get(input.where.tenantId) ?? {}),
              ...(rows.has(input.where.tenantId) ? input.update : input.create),
              tenantId: input.where.tenantId
            } as PrismaCurrentShiftRow;
            rows.set(saved.tenantId, saved);
            return saved;
          }
        }
      };
      const repository = CurrentShiftRepository.prisma({ client: client as never });

      await repository.saveCurrent({
        endsAt: new Date("2026-08-20T17:00:00.000Z"),
        name: "Дневная смена",
        operatorIds: ["operator-anna"],
        startsAt: new Date("2026-08-20T09:00:00.000Z"),
        tenantId: TENANT,
        updatedAt: new Date("2026-08-20T08:00:00.000Z")
      });

      assert.equal(upserts.length, 1);
      assert.deepEqual(upserts[0]?.where, { tenantId: TENANT });
      assert.equal((upserts[0]?.create as { tenantId: string }).tenantId, TENANT);
      assert.equal((upserts[0]?.update as { tenantId?: string }).tenantId, undefined);
    });
  });

  describe("service", () => {
    it("validates active tenant operators, saves a shift, and emits shift.updated", async () => {
      const sinks = createRealtimeSinks();
      const service = new CurrentShiftService({
        conversationRepository: sinks.conversationRepository,
        currentShiftRepository: CurrentShiftRepository.inMemory(),
        identityRepository: createIdentityStub([
          { id: "operator-anna" },
          { id: "operator-ivan" },
          { id: "operator-inactive", status: "inactive" },
          { id: "operator-other", tenantId: "tenant-other" }
        ]),
        realtimeFanout: sinks.realtimeFanout
      });

      const empty = await service.fetchCurrentShift({ tenantId: TENANT });
      assert.equal(empty.status, "ok");
      assert.equal(empty.data.shift, null);

      const saved = await service.saveCurrentShift({
        endsAt: "2026-08-20T17:00:00.000Z",
        name: "  Дневная смена  ",
        operatorIds: ["operator-anna", "operator-ivan"],
        startsAt: "2026-08-20T09:00:00.000Z"
      }, { actorId: "operator-anna", actorType: "operator", tenantId: TENANT });

      assert.equal(saved.status, "ok");
      assert.deepEqual((saved.data.shift as { operatorIds: string[] }).operatorIds, ["operator-anna", "operator-ivan"]);
      assert.equal((saved.data.shift as { name: string }).name, "Дневная смена");
      assert.equal(sinks.appended.length, 1);
      assert.equal(sinks.appended[0]?.eventName, SHIFT_UPDATED_EVENT);
      assert.equal(sinks.appended[0]?.tenantId, TENANT);
      assert.deepEqual((sinks.appended[0]?.data.shift as { operatorIds: string[] }).operatorIds, ["operator-anna", "operator-ivan"]);
      assert.equal(sinks.published.length, 1);

      const inactive = await service.saveCurrentShift({
        endsAt: "2026-08-20T17:00:00.000Z",
        name: "Дневная смена",
        operatorIds: ["operator-inactive", "operator-other"],
        startsAt: "2026-08-20T09:00:00.000Z"
      }, { tenantId: TENANT });
      assert.equal(inactive.status, "invalid");
      assert.equal(inactive.error?.code, "shift_operators_not_active");
      assert.equal(sinks.appended.length, 1);
    });

    it("rejects malformed ISO timestamps, reversed ranges, and duplicated operators", async () => {
      const service = new CurrentShiftService({
        conversationRepository: createRealtimeSinks().conversationRepository,
        currentShiftRepository: CurrentShiftRepository.inMemory(),
        identityRepository: createIdentityStub([{ id: "operator-anna" }]),
        realtimeFanout: createRealtimeSinks().realtimeFanout
      });

      const malformed = await service.saveCurrentShift({
        endsAt: "2026-02-30T17:00:00.000Z",
        name: "Смена",
        operatorIds: ["operator-anna"],
        startsAt: "2026-08-20T09:00:00.000Z"
      }, { tenantId: TENANT });
      assert.equal(malformed.status, "invalid");
      assert.equal(malformed.error?.code, "shift_timestamp_invalid");

      const reversed = await service.saveCurrentShift({
        endsAt: "2026-08-20T09:00:00.000Z",
        name: "Смена",
        operatorIds: ["operator-anna"],
        startsAt: "2026-08-20T17:00:00.000Z"
      }, { tenantId: TENANT });
      assert.equal(reversed.error?.code, "shift_time_range_invalid");

      const duplicate = await service.saveCurrentShift({
        endsAt: "2026-08-20T17:00:00.000Z",
        name: "Смена",
        operatorIds: ["operator-anna", "operator-anna"],
        startsAt: "2026-08-20T09:00:00.000Z"
      }, { tenantId: TENANT });
      assert.equal(duplicate.error?.code, "shift_operator_ids_duplicate");
    });
  });

  describe("runtime contract", () => {
    it("keeps the API route permission-scoped and persists the singleton in Prisma", () => {
      const controller = readFileSync(new URL("../apps/api-gateway/src/shifts/current-shift.controller.ts", import.meta.url), "utf8");
      const migration = readFileSync(new URL("../prisma/migrations/202608200001_current_shifts/migration.sql", import.meta.url), "utf8");
      const main = readFileSync(new URL("../apps/api-gateway/src/main.ts", import.meta.url), "utf8");

      assert.match(controller, /@Controller\("shifts"\)/);
      assert.match(controller, /@Get\("current"\)/);
      assert.match(controller, /@Put\("current"\)/);
      assert.match(controller, /RequireTenantOperatorPermission\("routing\.redistribute"\)/);
      assert.match(controller, /RequireServiceAdminAction\("routing\.redistribute"\)/);
      assert.match(migration, /CREATE TABLE "current_shifts"/);
      assert.match(migration, /PRIMARY KEY \("tenant_id"\)/);
      assert.match(migration, /CHECK \("ends_at" > "starts_at"\)/);
      assert.match(main, /configureCurrentShiftRepository\(config\)/);
      assert.match(main, /CurrentShiftService\.configureRealtimeFanoutFromEnv/);
    });
  });
});
