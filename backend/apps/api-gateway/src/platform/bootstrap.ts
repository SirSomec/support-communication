import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PlatformRepository } from "./platform.repository.js";

export interface PlatformRepositoryBootstrapSource {
  NODE_ENV?: string;
  PLATFORM_STORE_FILE?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export function configurePlatformRepository(source: PlatformRepositoryBootstrapSource = process.env): PlatformRepository {
  const repository = PlatformRepository.open({ filePath: resolvePlatformStoreFile(source) });
  PlatformRepository.useDefault(repository);
  return repository;
}

export function resolvePlatformStoreFile(source: PlatformRepositoryBootstrapSource = process.env): string {
  const configuredPath = source.PLATFORM_STORE_FILE?.trim();
  if (configuredPath) {
    return resolve(configuredPath);
  }

  const serviceName = sanitizePathSegment(source.SERVICE_NAME ?? "api-gateway");
  const nodeEnv = sanitizePathSegment(source.NODE_ENV ?? "development");
  const port = sanitizePathSegment(String(source.PORT ?? "4100"));

  return join(tmpdir(), "support-communication", `${serviceName}-${nodeEnv}-${port}-platform.json`);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "default";
}
