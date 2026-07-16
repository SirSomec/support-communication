import { configureRepositoryBootstrap, createPrismaClient, type PrismaClientFactoryOptions } from "@support-communication/database";
import { BillingRepository, type BillingState, type PrismaBillingClient } from "./billing.repository.js";

export interface BillingRepositoryBootstrapSource {
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
    createPrismaRepository: (client) => BillingRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => BillingRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaBillingClient {
  return createPrismaClient(options) as PrismaBillingClient;
}
