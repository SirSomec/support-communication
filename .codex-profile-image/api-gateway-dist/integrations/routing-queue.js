export function resolveConnectionRoutingQueue(connections, input) {
    const tenantId = input.tenantId.trim();
    const type = input.type.trim().toLowerCase();
    const externalId = String(input.rawExternalId ?? "").trim().toLowerCase();
    const connectionId = String(input.connectionId ?? "").trim();
    const candidates = connections.filter((connection) => (connection.tenantId === tenantId
        && connection.type.trim().toLowerCase() === type
        && connection.status.trim().toLowerCase() === "active"
        && connection.routingQueueId.trim()));
    const exact = connectionId
        ? candidates.find((connection) => connection.id === connectionId)
        : externalId
            ? candidates.find((connection) => connection.rawExternalId.trim().toLowerCase() === externalId)
            : undefined;
    if (exact) {
        return exact.routingQueueId.trim();
    }
    return candidates.length === 1 ? candidates[0].routingQueueId.trim() : undefined;
}
//# sourceMappingURL=routing-queue.js.map