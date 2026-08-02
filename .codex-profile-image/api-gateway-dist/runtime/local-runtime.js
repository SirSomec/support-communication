export function isLocalRuntime(nodeEnv = process.env.NODE_ENV ?? "development") {
    return nodeEnv === "development" || nodeEnv === "test";
}
//# sourceMappingURL=local-runtime.js.map