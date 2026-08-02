export const QUALITY_SCORING_PROVIDER_PORT_VERSION = "quality-scoring-provider/v1";
export function normalizeQualityScoringProviderResult(result) {
    if (result.portVersion !== QUALITY_SCORING_PROVIDER_PORT_VERSION) {
        throw new Error("quality_scoring_provider_port_version_mismatch");
    }
    if (result.status === "failed") {
        return {
            checks: clone(result.checks),
            error: clone(result.error),
            explainability: clone(result.explainability),
            portVersion: result.portVersion,
            providerId: result.providerId,
            providerResultId: result.providerResultId,
            repairActions: clone(result.repairActions),
            score: null,
            status: "failed",
            telemetry: sanitizeTelemetry(result.telemetry)
        };
    }
    return {
        checks: clone(result.checks),
        explainability: clone(result.explainability),
        portVersion: result.portVersion,
        providerId: result.providerId,
        providerResultId: result.providerResultId,
        repairActions: clone(result.repairActions),
        score: result.score,
        status: "ok",
        telemetry: sanitizeTelemetry(result.telemetry)
    };
}
function sanitizeTelemetry(telemetry) {
    const sanitized = {
        model: telemetry.model,
        providerId: telemetry.providerId,
        requestFingerprint: telemetry.requestFingerprint
    };
    if (typeof telemetry.latencyMs === "number") {
        sanitized.latencyMs = telemetry.latencyMs;
    }
    if (telemetry.usage) {
        const usage = {};
        if (typeof telemetry.usage.inputTokens === "number") {
            usage.inputTokens = telemetry.usage.inputTokens;
        }
        if (typeof telemetry.usage.outputTokens === "number") {
            usage.outputTokens = telemetry.usage.outputTokens;
        }
        sanitized.usage = usage;
    }
    return clone(sanitized);
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=quality-scoring.provider.js.map