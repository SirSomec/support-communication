import { configureRepositoryBootstrap, createPrismaClient, resolveRepositoryStoreFile, type PrismaClientFactoryOptions } from "@support-communication/database";
import { BillingRepository, type BillingState, type PrismaBillingClient } from "./billing.repository.js";

export interface BillingRepositoryBootstrapSource {
  BILLING_REPOSITORY?: string;
  BILLING_STORE_FILE?: string;
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface BillingRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaBillingClient;
  seed?: BillingState;
}

export function configureBillingRepository(
  source: BillingRepositoryBootstrapSource = process.env,
  options: BillingRepositoryBootstrapOptions = {}
): BillingRepository {
  return configureRepositoryBootstrap({
    createJsonRepository: (filePath) => BillingRepository.open({ filePath, seed: options.seed }),
    createPrismaRepository: (client) => BillingRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "BILLING_REPOSITORY",
    source,
    storeFileEnv: "BILLING_STORE_FILE",
    suffix: "billing",
    useDefault: (repository) => BillingRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaBillingClient {
  return createPrismaClient(options) as PrismaBillingClient;
}

export function resolveBillingStoreFile(source: BillingRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "BILLING_STORE_FILE",
    suffix: "billing"
  });
}
