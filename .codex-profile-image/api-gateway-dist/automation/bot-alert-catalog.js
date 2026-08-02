/** Alert catalog for bot/AI operations — each entry has an owner and recovery actions. */
export const BOT_ALERT_DEFINITIONS = {
    high_fallback_rate: {
        id: "high_fallback_rate",
        owner: "tenant-admin + support-lead",
        recoverySteps: [
            "Проверить retrieval top-score и cache hit в telemetry workspace.",
            "Обновить или переиндексировать источники знаний сценария.",
            "Уточнить ключевые фразы и fallback-текст, затем прогнать песочницу.",
            "При сохранении высокого handoff — временно снизить priority или поставить сценарий на паузу."
        ],
        severity: "medium",
        summary: "Доля handoff/fallback относительно AI-ответов превышает порог.",
        title: "Высокий fallback rate"
    },
    ingestion_backlog: {
        id: "ingestion_backlog",
        owner: "platform-ops",
        recoverySteps: [
            "Проверить worker индексации URL/document и очередь source refresh.",
            "Перезапустить зависший ingestion worker и убедиться, что source не в private IP allowlist-block.",
            "При backlog > SLA — отключить новые URL-source до очистки очереди.",
            "Сообщить tenant-admin о задержке обновления знаний."
        ],
        severity: "high",
        summary: "Ошибки источников или backlog индексации растут.",
        title: "Ingestion backlog / source errors"
    },
    provider_outage: {
        id: "provider_outage",
        owner: "service-admin",
        recoverySteps: [
            "Проверить статус AI-подключения tenant в Service Admin и connectivity test.",
            "При outage провайдера — отключить AI-сценарии или оставить только fallback/handoff.",
            "Ротировать ключ только после подтверждения, что секрет не скомпрометирован.",
            "Зафиксировать incident и вернуть сценарии после успешного re-test."
        ],
        severity: "critical",
        summary: "AI provider недоступен или массово возвращает ошибки.",
        title: "AI provider outage"
    },
    quota_spike: {
        id: "quota_spike",
        owner: "service-admin",
        recoverySteps: [
            "Проверить месячный token usage и лимиты connection.",
            "Временно снизить requestsPerMinute / monthlyTokenBudget или отключить частые AI-сценарии.",
            "Найти сценарии с аномальным trigger match и cache miss.",
            "Согласовать с tenant повышение бюджета либо kill switch AI."
        ],
        severity: "high",
        summary: "Резкий рост token usage или срабатывания quota/rate limit.",
        title: "AI quota / cost spike"
    },
    runtime_dead_letter: {
        id: "runtime_dead_letter",
        owner: "platform-ops",
        recoverySteps: [
            "Открыть bot runtime dead-letter journal и взять lastError (уже redacted).",
            "Исправить webhook allowlist/timeout или node config, затем replay/retry.",
            "При массовом dead-letter — поставить затронутые сценарии на паузу.",
            "Проверить reconciliation worker и outbox delivery."
        ],
        severity: "high",
        summary: "Runtime steps уходят в dead-letter или delivery failures.",
        title: "Bot runtime dead-letter"
    },
    unsafe_source_denial: {
        id: "unsafe_source_denial",
        owner: "security + service-admin",
        recoverySteps: [
            "Проверить failure_code источника (SSRF, private IP, MIME, MCP write denial).",
            "Не расширять allowlist без security review.",
            "Отключить проблемный source/MCP connector и снять его из scenario bindings.",
            "Записать audit denial и эскалировать, если denial повторяется cross-tenant."
        ],
        severity: "critical",
        summary: "Отказ небезопасного URL/MCP источника (policy denial).",
        title: "Unsafe source / MCP denial"
    }
};
const DEFAULT_THRESHOLDS = {
    aiErrorMin: 3,
    fallbackRatio: 0.5,
    handoffMin: 5,
    publishFailureMin: 2,
    quotaErrorMin: 2,
    sourceErrorMin: 3,
    unsafeDenialMin: 1
};
export function evaluateBotAlerts(input, thresholds = {}) {
    const limits = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const aiErrorCount = nonNegative(input.aiErrorCount);
    const aiOkCount = nonNegative(input.aiOkCount);
    const handoffCount = nonNegative(input.handoffCount);
    const sourceErrorCount = nonNegative(input.sourceErrorCount);
    const quotaErrorCount = nonNegative(input.quotaErrorCount);
    const unsafeDenialCount = nonNegative(input.unsafeDenialCount);
    const deliveryFailureCount = nonNegative(input.deliveryFailureCount);
    const publishFailureCount = nonNegative(input.publishFailureCount);
    const aiTotal = aiErrorCount + aiOkCount;
    const fallbackRatio = aiTotal > 0 ? handoffCount / Math.max(aiTotal, handoffCount) : handoffCount > 0 ? 1 : 0;
    return [
        {
            active: aiErrorCount >= limits.aiErrorMin && aiErrorCount >= aiOkCount,
            definition: BOT_ALERT_DEFINITIONS.provider_outage,
            evidence: { aiErrorCount, aiOkCount },
            id: "provider_outage"
        },
        {
            active: sourceErrorCount >= limits.sourceErrorMin,
            definition: BOT_ALERT_DEFINITIONS.ingestion_backlog,
            evidence: { sourceErrorCount },
            id: "ingestion_backlog"
        },
        {
            active: quotaErrorCount >= limits.quotaErrorMin,
            definition: BOT_ALERT_DEFINITIONS.quota_spike,
            evidence: { quotaErrorCount },
            id: "quota_spike"
        },
        {
            active: unsafeDenialCount >= limits.unsafeDenialMin,
            definition: BOT_ALERT_DEFINITIONS.unsafe_source_denial,
            evidence: { unsafeDenialCount },
            id: "unsafe_source_denial"
        },
        {
            active: deliveryFailureCount >= 1 || publishFailureCount >= limits.publishFailureMin,
            definition: BOT_ALERT_DEFINITIONS.runtime_dead_letter,
            evidence: { deliveryFailureCount, publishFailureCount },
            id: "runtime_dead_letter"
        },
        {
            active: handoffCount >= limits.handoffMin && fallbackRatio >= limits.fallbackRatio,
            definition: BOT_ALERT_DEFINITIONS.high_fallback_rate,
            evidence: { fallbackRatio: Number(fallbackRatio.toFixed(3)), handoffCount },
            id: "high_fallback_rate"
        }
    ].filter((item) => item.active);
}
export function summarizeBotMetricsForAlerts(snapshot) {
    const sum = (name, predicate) => {
        const metric = snapshot.find((item) => item.name === name);
        if (!metric)
            return 0;
        return metric.samples
            .filter((sample) => typeof sample.value === "number" && (predicate ? predicate(sample.labels) : true))
            .reduce((total, sample) => total + Number(sample.value ?? 0), 0);
    };
    return {
        aiErrorCount: sum("bot_ai_requests_total", (labels) => labels.status === "error"),
        aiOkCount: sum("bot_ai_requests_total", (labels) => labels.status === "ok"),
        deliveryFailureCount: sum("bot_delivery_failures_total"),
        handoffCount: sum("bot_handoff_total"),
        publishFailureCount: sum("bot_publish_failures_total"),
        quotaErrorCount: sum("bot_ai_requests_total", (labels) => /quota|rate_limit|concurrency/i.test(labels.error_code ?? "")),
        sourceErrorCount: sum("bot_source_errors_total"),
        unsafeDenialCount: sum("bot_source_errors_total", (labels) => /ssrf|private|unsafe|mcp.*denial|deny/i.test(labels.failure_code ?? ""))
    };
}
function nonNegative(value) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
//# sourceMappingURL=bot-alert-catalog.js.map