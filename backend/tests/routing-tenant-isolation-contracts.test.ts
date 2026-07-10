import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { routingConversationFixtures, routingOperatorFixtures, routingQueueFixtures } from "../apps/api-gateway/src/routing/seed-catalog.ts";
import { RoutingRepository } from "../apps/api-gateway/src/routing/routing.repository.ts";
import { RoutingService } from "../apps/api-gateway/src/routing/routing.service.ts";

describe("routing tenant isolation contracts", () => {
  beforeEach(() => {
    RoutingRepository.useDefault(RoutingRepository.inMemory());
  });

  afterEach(() => {
    RoutingRepository.clearDefault();
  });

  it("isolates workload reads between tenants", async () => {
    const repository = RoutingRepository.inMemory({
      operators: [
        { ...routingOperatorFixtures[0], id: "operator-volga", name: "Volga Operator", tenantId: "tenant-volga" },
        { ...routingOperatorFixtures[0], id: "operator-ladoga", name: "Ladoga Operator", tenantId: "tenant-ladoga" }
      ],
      queues: [
        { ...routingQueueFixtures[0], channel: "VK", tenantId: "tenant-volga" },
        { ...routingQueueFixtures[0], channel: "Telegram", active: 99, tenantId: "tenant-ladoga" }
      ]
    });
    const routing = new RoutingService(repository);

    const volga = await routing.fetchWorkload({}, { tenantId: "tenant-volga" });
    const ladoga = await routing.fetchWorkload({}, { tenantId: "tenant-ladoga" });

    assert.equal(volga.data.operators.length, 1);
    assert.equal(volga.data.operators[0].name, "Volga Operator");
    assert.equal(ladoga.data.operators.length, 1);
    assert.equal(ladoga.data.operators[0].name, "Ladoga Operator");
    assert.notEqual(volga.data.queues[0]?.active, ladoga.data.queues[0]?.active);
  });

  it("emits realtime routing descriptors with the request tenant id", async () => {
    const repository = RoutingRepository.inMemory({
      conversations: [
        { ...routingConversationFixtures[2], id: "ladoga-alexey", tenantId: "tenant-ladoga" }
      ],
      operators: [
        { ...routingOperatorFixtures[1], id: "operator-ladoga", name: "Ladoga Operator", tenantId: "tenant-ladoga" }
      ],
      queues: [
        { ...routingQueueFixtures[3], tenantId: "tenant-ladoga" }
      ]
    });
    const routing = new RoutingService(repository);

    const assignment = await routing.createAssignment({
      action: "assign",
      conversationId: "ladoga-alexey",
      reason: "Tenant realtime descriptor",
      targetOperatorId: "operator-ladoga"
    }, { tenantId: "tenant-ladoga" });

    assert.equal(assignment.status, "ok");
    assert.equal(assignment.data.conversation.tenantId, "tenant-ladoga");
    assert.equal(assignment.data.realtimeEvent.tenantId, "tenant-ladoga");
  });
});
