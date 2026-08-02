import { redactSensitiveText } from "@support-communication/redaction";
const BOT_RUNTIME_ALLOWED_NODE_TYPES = new Set(["message", "ai_reply", "quick_replies", "condition", "contact_request", "webhook", "handoff", "fallback"]);
export function planBotRuntimeLabeledTransition(input) {
    const edges = input.scenario.flowEdges.filter((edge) => edge.from === input.currentNodeId && (input.edgeLabel === undefined || edge.label === input.edgeLabel));
    if (edges.length !== 1)
        throw new Error(edges.length ? "bot_runtime_transition_ambiguous" : "bot_runtime_transition_edge_not_found");
    return planBotRuntimeStateTransition({ ...input, scenario: { ...input.scenario, flowEdges: edges } });
}
/**
 * Consultation mode: the dialog stays on the same `ai_reply` node for the next
 * client message instead of moving along an edge. Exit conditions (client asks
 * for a human, turn limit, AI failure) are decided by node execution, not here.
 */
export function planBotRuntimeConsultationStay(input) {
    validateBotRuntimeScenario(input);
    const node = input.scenario.flowNodes.find((item) => item.id === input.currentNodeId);
    if (!node)
        throw new Error("bot_runtime_transition_node_not_found");
    if (node.type !== "ai_reply")
        throw new Error("bot_runtime_consultation_node_not_ai");
    return {
        conversationId: input.conversationId,
        eventId: input.eventId,
        nextNodeId: node.id,
        nodeType: node.type,
        previousNodeId: input.currentNodeId,
        scenarioId: input.scenario.id,
        sideEffects: createStateTransitionSideEffects(input, node),
        status: "transitioned",
        tenantId: input.tenantId,
        traceId: input.traceId
    };
}
export function planBotRuntimeStateTransition(input) {
    validateBotRuntimeScenario(input);
    const matchingEdges = input.scenario.flowEdges.filter((item) => item.from === input.currentNodeId);
    const [edge] = matchingEdges;
    if (!edge) {
        throw new Error("bot_runtime_transition_edge_not_found");
    }
    if (matchingEdges.length > 1) {
        throw new Error("bot_runtime_transition_ambiguous");
    }
    const nextNode = input.scenario.flowNodes.find((node) => node.id === edge.to);
    if (!nextNode) {
        throw new Error("bot_runtime_transition_node_not_found");
    }
    if (!BOT_RUNTIME_ALLOWED_NODE_TYPES.has(nextNode.type)) {
        throw new Error("bot_runtime_transition_node_type_unsupported");
    }
    return {
        conversationId: input.conversationId,
        eventId: input.eventId,
        nextNodeId: nextNode.id,
        nodeType: nextNode.type,
        previousNodeId: input.currentNodeId,
        scenarioId: input.scenario.id,
        sideEffects: createStateTransitionSideEffects(input, nextNode),
        status: "transitioned",
        tenantId: input.tenantId,
        traceId: input.traceId
    };
}
function validateBotRuntimeScenario(input) {
    if (input.scenario.schemaVersion !== "bot-flow/v1") {
        throw new Error("bot_runtime_scenario_schema_unsupported");
    }
    if (!["published", "enabled"].includes(input.scenario.status)) {
        throw new Error("bot_runtime_scenario_not_published");
    }
    if (input.scenario.tenantId && input.scenario.tenantId !== input.tenantId) {
        throw new Error("bot_runtime_scenario_tenant_mismatch");
    }
    const channel = input.channel ?? input.scenario.channels[0];
    if (!channel || !input.scenario.channels.includes(channel)) {
        throw new Error("bot_runtime_scenario_channel_unsupported");
    }
}
export function applyBotRuntimeStateTransition(state, transition, updatedAt = new Date().toISOString()) {
    return {
        ...state,
        conversationId: transition.conversationId,
        currentNodeId: transition.nextNodeId,
        lastEventId: transition.eventId,
        previousNodeId: transition.previousNodeId,
        scenarioId: transition.scenarioId,
        tenantId: transition.tenantId,
        traceId: transition.traceId,
        updatedAt
    };
}
export async function persistBotRuntimeOutboundDescriptors(input) {
    const records = [];
    for (const sideEffect of input.transition.sideEffects) {
        if (sideEffect.kind !== "message_delivery") {
            continue;
        }
        const record = await input.conversationRepository.recordOutboundDescriptor({
            descriptor: sideEffect.descriptor
        });
        records.push(record);
    }
    return records;
}
export async function persistBotRuntimeHandoffDescriptors(input) {
    const records = [];
    for (const sideEffect of input.transition.sideEffects) {
        if (sideEffect.kind !== "bot_handoff") {
            continue;
        }
        const existing = (await input.conversationRepository.listRealtimeEvents({
            tenantId: sideEffect.descriptor.tenantId,
            take: 500
        })).find((event) => event.eventId === sideEffect.descriptor.eventId);
        const realtimeEvent = existing ?? await input.conversationRepository.appendRealtimeEvent(toBotRuntimeHandoffRealtimeEvent(sideEffect.descriptor, input.occurredAt ?? new Date().toISOString()));
        records.push({
            descriptor: sideEffect.descriptor,
            realtimeEvent
        });
    }
    return records;
}
export function resolveBotRuntimeRetryState(input) {
    const failedAt = parseStrictIsoInstant(input.failedAt, "bot_runtime_retry_failed_at_invalid");
    const retryBackoffMs = positiveInteger(input.retryBackoffMs);
    if (retryBackoffMs === undefined) {
        throw new Error("bot_runtime_retry_backoff_invalid");
    }
    const nextAttemptMs = failedAt.getTime() + retryBackoffMs;
    if (!Number.isFinite(nextAttemptMs)) {
        throw new Error("bot_runtime_retry_backoff_invalid");
    }
    const nextAttemptAt = new Date(nextAttemptMs);
    if (Number.isNaN(nextAttemptAt.getTime())) {
        throw new Error("bot_runtime_retry_backoff_invalid");
    }
    return {
        attempts: Math.max(0, Math.trunc(input.currentAttempts ?? 0)) + 1,
        deadLetteredAt: null,
        failedAt: failedAt.toISOString(),
        lastError: redactSensitiveText(typeof input.error === "string" ? input.error : input.error.message),
        nextAttemptAt: nextAttemptAt.toISOString(),
        status: "retry_scheduled"
    };
}
export function resolveBotRuntimeDeadLetterState(input) {
    const failedAt = parseStrictIsoInstant(input.failedAt, "bot_runtime_dead_letter_failed_at_invalid");
    return {
        attempts: Math.max(0, Math.trunc(input.currentAttempts ?? 0)) + 1,
        deadLetteredAt: failedAt.toISOString(),
        failedAt: failedAt.toISOString(),
        lastError: redactSensitiveText(typeof input.error === "string" ? input.error : input.error.message),
        nextAttemptAt: null,
        status: "dead_lettered"
    };
}
function createStateTransitionSideEffects(input, node) {
    if (!["message", "ai_reply", "quick_replies", "contact_request", "fallback"].includes(node.type)) {
        if (node.type === "handoff") {
            return [createBotRuntimeHandoffSideEffect(input, node)];
        }
        return [];
    }
    const messageId = makeBotRuntimeMessageId(input.eventId, node.id);
    const idempotencyKey = `bot-runtime:${input.eventId}:${node.id}`;
    return [{
            descriptor: {
                auditId: null,
                channel: input.channel ?? input.scenario.channels[0] ?? "SDK",
                conversationId: input.conversationId,
                createdAt: new Date().toISOString(),
                deliveryState: "queued",
                id: `delivery_${messageId}`,
                idempotencyKey,
                kind: "message_delivery",
                messageId,
                outboxEventId: null,
                payload: {
                    botName: input.scenario.name,
                    messageId,
                    nodeId: node.id,
                    ...(node.type === "quick_replies" ? { quickReplies: node.config?.quickReplies ?? [] } : {}),
                    ...(node.type === "contact_request" ? { contactField: node.config?.field ?? "contact" } : {}),
                    scenarioId: input.scenario.id,
                    text: node.title ?? ""
                },
                requestFingerprint: stableRuntimeFingerprint({
                    conversationId: input.conversationId,
                    eventId: input.eventId,
                    nodeId: node.id,
                    scenarioId: input.scenario.id,
                    tenantId: input.tenantId
                }),
                retryable: true,
                status: "queued",
                tenantId: input.tenantId,
                traceId: input.traceId
            },
            kind: "message_delivery"
        }];
}
function createBotRuntimeHandoffSideEffect(input, node) {
    return {
        descriptor: {
            eventId: `evt_bot_handoff_${sanitizeIdentifierSegment(input.eventId)}_${sanitizeIdentifierSegment(node.id)}`,
            eventName: "bot.handoff.created",
            resourceId: input.conversationId,
            resourceType: "conversation",
            schemaVersion: "bot-handoff/v1",
            summary: {
                botId: input.scenario.id,
                nodeId: node.id,
                queue: String(node.config?.queueId ?? ""),
                reason: "handoff_requested"
            },
            tenantId: input.tenantId,
            traceId: input.traceId
        },
        kind: "bot_handoff"
    };
}
function makeBotRuntimeMessageId(eventId, nodeId) {
    return `bot_msg_${sanitizeIdentifierSegment(eventId)}_${sanitizeIdentifierSegment(nodeId)}`;
}
function toBotRuntimeHandoffRealtimeEvent(descriptor, occurredAt) {
    return {
        data: descriptor.summary,
        eventId: descriptor.eventId,
        eventName: descriptor.eventName,
        occurredAt,
        resourceId: descriptor.resourceId,
        resourceType: descriptor.resourceType,
        schemaVersion: descriptor.schemaVersion,
        tenantId: descriptor.tenantId,
        traceId: descriptor.traceId
    };
}
function sanitizeIdentifierSegment(value) {
    return value.replace(/[^a-z0-9_]+/gi, "_");
}
function stableRuntimeFingerprint(value) {
    return JSON.stringify(Object.keys(value).sort().reduce((result, key) => {
        result[key] = value[key];
        return result;
    }, {}));
}
function parseStrictIsoInstant(value, errorCode) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
        throw new Error(errorCode);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
        throw new Error(errorCode);
    }
    return parsed;
}
function positiveInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
//# sourceMappingURL=bot-runtime.worker.js.map