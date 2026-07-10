export function isLocalRuntime(nodeEnv = process.env.NODE_ENV ?? "development"): boolean {
  return nodeEnv === "development" || nodeEnv === "test";
}
