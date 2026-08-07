import { spawnSync } from "node:child_process";

const PLAINTEXT_FLAG = "REDIS_ALLOW_PLAINTEXT_ON_INTERNAL_DOCKER_NETWORK";
const NETWORK_KEY = "REDIS_INTERNAL_DOCKER_NETWORK";

export function validateRedisUrlPolicy(env, { verifyRuntime = false } = {}) {
  const issues = [];
  if (!env.REDIS_URL) return issues;

  let redisUrl;
  try {
    redisUrl = new URL(env.REDIS_URL);
  } catch {
    return ["REDIS_URL: invalid URL"];
  }

  if (redisUrl.protocol === "rediss:") return issues;
  if (redisUrl.protocol !== "redis:") return ["REDIS_URL: protocol must be rediss:"];

  if (!verifyRuntime) {
    issues.push("REDIS_URL: plaintext redis: requires --verify-runtime and a proven internal Docker topology");
  }
  if (env[PLAINTEXT_FLAG] !== "true") {
    issues.push(`${PLAINTEXT_FLAG}: must be exactly true for an inspected plaintext Redis exception`);
  }
  if (!env[NETWORK_KEY] || !/^[A-Za-z0-9_.-]+$/.test(env[NETWORK_KEY])) {
    issues.push(`${NETWORK_KEY}: a valid Docker network name is required`);
  }
  if (redisUrl.hostname !== "redis") {
    issues.push("REDIS_URL: plaintext exception requires the Docker DNS hostname redis");
  }
  if (!redisUrl.password) {
    issues.push("REDIS_URL: plaintext exception requires credentials");
  }
  if (redisUrl.port && redisUrl.port !== "6379") {
    issues.push("REDIS_URL: plaintext exception allows only the internal Redis port 6379");
  }
  return issues;
}

export function verifyRedisRuntimeTopology(env, runDocker = defaultRunDocker) {
  const networkName = env[NETWORK_KEY];
  const issues = [];
  if (!networkName) return [`${NETWORK_KEY}: required for runtime inspection`];

  const network = readDockerJson(runDocker, ["network", "inspect", networkName], "Docker network inspection", issues)?.[0];
  if (!network) return issues;
  if (network.Driver !== "bridge") issues.push(`${NETWORK_KEY}: network driver must be bridge`);
  if (network.Internal !== true) issues.push(`${NETWORK_KEY}: network must be internal`);
  if (network.Ingress === true) issues.push(`${NETWORK_KEY}: ingress networks are forbidden`);
  if (network.Attachable === true) issues.push(`${NETWORK_KEY}: attachable networks are forbidden`);

  const containerList = runDocker(["ps", "--filter", `network=${networkName}`, "--format", "{{.ID}}"]);
  if (containerList.status !== 0) {
    issues.push("Docker container inspection failed");
    return issues;
  }

  const containerIds = String(containerList.stdout || "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const services = new Map();
  for (const containerId of containerIds) {
    const labels = readDockerJson(
      runDocker,
      ["inspect", "--format", "{{json .Config.Labels}}", containerId],
      "Docker container label inspection",
      issues
    );
    const service = labels?.["com.docker.compose.service"];
    if (service === "redis" || service === "api-gateway") {
      if (services.has(service)) {
        issues.push(`${service}: exactly one running container must be attached to the inspected network`);
      } else {
        services.set(service, containerId);
      }
    }
  }

  for (const service of ["redis", "api-gateway"]) {
    if (!services.has(service)) issues.push(`${service}: running container is missing from the inspected network`);
  }
  if (!services.has("redis") || !services.has("api-gateway")) return issues;

  const redisId = services.get("redis");
  const redisNetworks = readDockerJson(
    runDocker,
    ["inspect", "--format", "{{json .NetworkSettings.Networks}}", redisId],
    "Redis network inspection",
    issues
  );
  const aliases = redisNetworks?.[networkName]?.Aliases;
  if (!Array.isArray(aliases) || !aliases.includes("redis")) {
    issues.push("redis: inspected network must expose the exact Docker alias redis");
  }

  const portBindings = readDockerJson(
    runDocker,
    ["inspect", "--format", "{{json .HostConfig.PortBindings}}", redisId],
    "Redis port inspection",
    issues
  );
  if (portBindings && Object.values(portBindings).some((bindings) => Array.isArray(bindings) && bindings.length > 0)) {
    issues.push("redis: published host ports are forbidden for the plaintext exception");
  }

  const apiNetworks = readDockerJson(
    runDocker,
    ["inspect", "--format", "{{json .NetworkSettings.Networks}}", services.get("api-gateway")],
    "API network inspection",
    issues
  );
  if (!apiNetworks?.[networkName]) issues.push("api-gateway: inspected Redis network is not attached");

  return issues;
}

function readDockerJson(runDocker, args, label, issues) {
  const result = runDocker(args);
  if (result.status !== 0) {
    issues.push(`${label} failed`);
    return null;
  }
  try {
    return JSON.parse(String(result.stdout || "null"));
  } catch {
    issues.push(`${label} returned invalid JSON`);
    return null;
  }
}

function defaultRunDocker(args) {
  return spawnSync("docker", args, { encoding: "utf8", windowsHide: true });
}
