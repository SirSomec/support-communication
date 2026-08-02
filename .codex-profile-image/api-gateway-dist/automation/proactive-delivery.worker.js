import { createHash } from "node:crypto";
import { createOutboxEvent } from "@support-communication/events";
import { ProactiveExposureRepository } from "./proactive-exposure.repository.js";
import { evaluateProactiveExperimentAssignmentEligibilityAsync, evaluateProactiveExperimentAssignmentEligibility, evaluateProactiveExecutionWindowEligibilityAsync, evaluateProactiveExecutionWindowEligibility, evaluateProactiveFrequencyCapEligibilityAsync, evaluateProactiveFrequencyCapEligibility } from "./proactive-eligibility.js";
export function planProactiveDeliveryDescriptor(input) {
    const descriptorId = makeProactiveDeliveryId(input.rule.id, input.tenantId, input.subjectId);
    const idempotencyKey = `proactive-delivery:${input.tenantId}:${input.rule.id}:${input.subjectId}`;
    const descriptorPayload = {
        channel: input.channel,
        evaluatedAt: input.evaluatedAt,
        message: input.message,
        phone: input.phone,
        proactiveRuleId: input.rule.id,
        queue: "message-delivery",
        segment: input.rule.segment ?? "manual",
        subjectId: input.subjectId,
        topic: input.topic,
        variant: input.rule.activeVariant ?? "A"
    };
    const requestFingerprint = createRequestFingerprint("proactive_delivery", {
        channel: input.channel,
        idempotencyKey,
        message: input.message,
        phone: input.phone,
        proactiveRuleId: input.rule.id,
        queue: "message-delivery",
        segment: input.rule.segment ?? "manual",
        subjectId: input.subjectId,
        tenantId: input.tenantId,
        topic: input.topic,
        variant: input.rule.activeVariant ?? "A"
    });
    const outbox = createOutboxEvent({
        aggregateId: descriptorId,
        aggregateType: "conversation_outbound",
        payload: {
            channel: input.channel,
            descriptorId,
            idempotencyKey,
            phone: input.phone,
            proactiveRuleId: input.rule.id,
            subjectId: input.subjectId,
            topic: input.topic
        },
        queue: "message-delivery",
        traceId: input.traceId,
        type: "conversation.outbound.requested"
    });
    const descriptor = {
        auditId: null,
        channel: input.channel,
        conversationId: null,
        createdAt: input.evaluatedAt,
        deliveryState: "queued",
        id: descriptorId,
        idempotencyKey,
        kind: "outbound_conversation",
        messageId: null,
        outboxEventId: outbox.id,
        payload: descriptorPayload,
        requestFingerprint,
        retryable: true,
        status: "queued",
        tenantId: input.tenantId,
        traceId: input.traceId
    };
    return {
        descriptor,
        outbox,
        requestFingerprint,
        ruleId: input.rule.id,
        status: "planned"
    };
}
export function planEligibleProactiveRuleDelivery(input) {
    for (const rule of input.rules) {
        if (rule.status !== "enabled") {
            continue;
        }
        if (!rule.channels.includes(input.channel)) {
            continue;
        }
        const windowEligibility = evaluateProactiveExecutionWindowEligibility({
            evaluatedAt: input.evaluatedAt,
            repository: input.repository,
            ruleId: rule.id,
            tenantId: input.tenantId
        });
        if (!windowEligibility.eligible) {
            continue;
        }
        const capEligibility = evaluateProactiveFrequencyCapEligibility({
            evaluatedAt: input.evaluatedAt,
            repository: input.repository,
            ruleId: rule.id,
            tenantId: input.tenantId
        });
        if (!capEligibility.eligible) {
            continue;
        }
        const experimentEligibility = evaluateProactiveExperimentAssignmentEligibility({
            assignedAt: input.evaluatedAt,
            experimentId: `exp-${rule.id}`,
            repository: input.repository,
            ruleId: rule.id,
            subjectId: input.subjectId,
            tenantId: input.tenantId,
            variants: input.activeVariants
        });
        if (!experimentEligibility.eligible) {
            continue;
        }
        return planProactiveDeliveryDescriptor({
            channel: input.channel,
            evaluatedAt: input.evaluatedAt,
            message: input.message,
            phone: input.phone,
            rule: {
                ...rule,
                activeVariant: experimentEligibility.assignment?.variant ?? rule.activeVariant
            },
            subjectId: input.subjectId,
            tenantId: input.tenantId,
            topic: input.topic,
            traceId: input.traceId
        });
    }
    return null;
}
export async function planEligibleProactiveRuleDeliveryAsync(input) {
    for (const rule of input.rules) {
        if (rule.status !== "enabled") {
            continue;
        }
        if (!rule.channels.includes(input.channel)) {
            continue;
        }
        const windowEligibility = await evaluateProactiveExecutionWindowEligibilityAsync({
            evaluatedAt: input.evaluatedAt,
            repository: input.repository,
            ruleId: rule.id,
            tenantId: input.tenantId
        });
        if (!windowEligibility.eligible) {
            continue;
        }
        const capEligibility = await evaluateProactiveFrequencyCapEligibilityAsync({
            evaluatedAt: input.evaluatedAt,
            repository: input.repository,
            ruleId: rule.id,
            tenantId: input.tenantId
        });
        if (!capEligibility.eligible) {
            continue;
        }
        const experimentEligibility = await evaluateProactiveExperimentAssignmentEligibilityAsync({
            assignedAt: input.evaluatedAt,
            experimentId: `exp-${rule.id}`,
            repository: input.repository,
            ruleId: rule.id,
            subjectId: input.subjectId,
            tenantId: input.tenantId,
            variants: input.activeVariants
        });
        if (!experimentEligibility.eligible) {
            continue;
        }
        return planProactiveDeliveryDescriptor({
            channel: input.channel,
            evaluatedAt: input.evaluatedAt,
            message: input.message,
            phone: input.phone,
            rule: {
                ...rule,
                activeVariant: experimentEligibility.assignment?.variant ?? rule.activeVariant
            },
            subjectId: input.subjectId,
            tenantId: input.tenantId,
            topic: input.topic,
            traceId: input.traceId
        });
    }
    return null;
}
export function persistProactiveDeliveryPlan(input) {
    return Promise.resolve(input.conversationRepository.recordOutboundDescriptor({
        descriptor: input.plan.descriptor,
        outbox: input.plan.outbox
    }));
}
export async function runProactiveDeliveryWorkerOnce(input) {
    const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
    const limit = normalizeLimit(input.limit);
    const activeVariants = normalizeVariants(input.activeVariants);
    const exposureRepository = input.exposureRepository ?? ProactiveExposureRepository.default();
    const rules = await input.automationRepository.listProactiveRulesAsync();
    const visitors = (await input.integrationRepository.listLiveSdkVisitorPresence({ at: evaluatedAt, limit }))
        .map((presence) => ({ channel: "SDK", channelConnectionId: presence.channelConnectionId,
        page: presence.pagePath ?? presence.pageUrl ?? undefined, presenceSessionId: presence.id,
        segment: segmentFromPath(presence.pagePath),
        subjectId: presence.subjectId, tenantId: presence.tenantId }));
    const result = {
        conflicted: 0,
        duplicate: 0,
        failed: 0,
        queued: 0,
        scanned: visitors.length,
        skipped: 0
    };
    for (let index = 0; index < visitors.length; index += 1) {
        const visitor = normalizeActiveVisitor(visitors[index]);
        if (!visitor) {
            result.skipped += 1;
            continue;
        }
        const eligibleRules = rules.filter((rule) => rule.tenantId === visitor.tenantId
            && (!rule.segment || rule.segment === visitor.segment));
        try {
            const plan = await planEligibleProactiveRuleDeliveryAsync({
                activeVariants,
                channel: visitor.channel,
                evaluatedAt,
                message: visitor.message,
                phone: "",
                repository: input.automationRepository,
                rules: eligibleRules,
                subjectId: visitor.subjectId,
                tenantId: visitor.tenantId,
                topic: visitor.topic,
                traceId: input.traceId ?? makeWorkerTraceId(evaluatedAt, index)
            });
            if (!plan) {
                result.skipped += 1;
                continue;
            }
            const variant = String(plan.descriptor.payload.variant ?? "A");
            const rule = eligibleRules.find((item) => item.id === plan.ruleId);
            const cooldownMs = parseCooldownMs(rule.cooldown);
            if (cooldownMs > 0) {
                const recent = await exposureRepository.listRecent(visitor.tenantId, rule.id, visitor.subjectId, new Date(Date.parse(evaluatedAt) - cooldownMs).toISOString());
                if (recent.some((item) => item.status !== "failed")) {
                    result.skipped += 1;
                    continue;
                }
            }
            const occurrenceKey = occurrencePeriodKey(evaluatedAt, await resolveFrequencyPeriod(input.automationRepository, visitor.tenantId, rule.id));
            const experimentId = `exp-${rule.id}`;
            const experimentVersion = createHash("sha256").update(stableStringify({ activeVariants, rule })).digest("hex").slice(0, 16);
            const created = await exposureRepository.createPlanned({ channelConnectionId: visitor.channelConnectionId,
                experimentId, experimentVersion, message: visitor.message, occurrenceKey, plannedAt: evaluatedAt,
                presenceSessionId: visitor.presenceSessionId, ruleId: rule.id,
                segmentSnapshot: { page: visitor.topic, segment: visitor.segment ?? null }, subjectId: visitor.subjectId,
                tenantId: visitor.tenantId, variant });
            if (created.created) {
                await persistProactiveDeliveryPlan({ conversationRepository: input.conversationRepository, plan });
                result.queued += 1;
            }
            else {
                result.duplicate += 1;
            }
        }
        catch {
            result.failed += 1;
        }
    }
    return result;
}
function makeProactiveDeliveryId(ruleId, tenantId, subjectId) {
    return `proactive_${sanitizeIdentifierSegment(ruleId)}_${sanitizeIdentifierSegment(tenantId)}_${sanitizeIdentifierSegment(subjectId)}`;
}
function normalizeActiveVisitor(value) {
    const tenantId = firstNonEmptyString(value.tenantId);
    const subjectId = firstNonEmptyString(value.subjectId, value.clientId, value.userId, value.id);
    const channel = firstNonEmptyString(value.channel);
    const channelConnectionId = firstNonEmptyString(value.channelConnectionId);
    const presenceSessionId = firstNonEmptyString(value.presenceSessionId);
    if (!tenantId || !subjectId || !channel || !channelConnectionId || !presenceSessionId) {
        return null;
    }
    const segment = firstNonEmptyString(value.segment);
    return {
        channel,
        channelConnectionId,
        message: firstNonEmptyString(value.message, value.proactiveMessage)
            ?? "Hello! We are available to help with this session.",
        presenceSessionId,
        ...(segment ? { segment } : {}),
        subjectId,
        tenantId,
        topic: firstNonEmptyString(value.topic, value.page, segment) ?? "Proactive visitor"
    };
}
async function resolveFrequencyPeriod(repository, tenantId, ruleId) {
    const caps = await repository.listProactiveFrequencyCapsAsync({ ruleId, tenantId });
    return caps.find((cap) => cap.active)?.period ?? "hour";
}
function occurrencePeriodKey(at, period) {
    const date = new Date(at);
    if (period === "hour")
        return date.toISOString().slice(0, 13);
    if (period === "day")
        return date.toISOString().slice(0, 10);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return date.toISOString().slice(0, 10);
}
function parseCooldownMs(value) {
    if (!value)
        return 0;
    if (/^\d+$/.test(value))
        return Number(value) * 1000;
    const compact = /^(\d+)\s*(s|m|h|d)$/i.exec(value.trim());
    if (compact)
        return Number(compact[1]) * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[compact[2].toLowerCase()] ?? 0);
    const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value);
    return match ? (Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)) * 1000 : 0;
}
function firstNonEmptyString(...values) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
}
function segmentFromPath(path) {
    return path?.split("/").map((item) => item.trim()).filter(Boolean)[0]?.toLowerCase();
}
function normalizeLimit(value) {
    return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 50;
}
function normalizeVariants(values) {
    const normalized = (values ?? ["A", "B"])
        .map((value) => value.trim())
        .filter(Boolean);
    return normalized.length ? [...new Set(normalized)] : ["A", "B"];
}
function makeWorkerTraceId(evaluatedAt, index) {
    return `trc_proactive_delivery_${sanitizeIdentifierSegment(evaluatedAt)}_${index + 1}`;
}
function createRequestFingerprint(scope, payload) {
    return createHash("sha256")
        .update(stableStringify({ payload, scope }))
        .digest("hex");
}
function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    if (value && typeof value === "object") {
        return `{${Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
function sanitizeIdentifierSegment(value) {
    return value.replace(/[^a-z0-9_]+/gi, "_");
}
//# sourceMappingURL=proactive-delivery.worker.js.map