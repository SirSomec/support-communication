import { type PrismaClientFactoryOptions } from "@support-communication/database";
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
export declare function configureBillingRepository(source?: BillingRepositoryBootstrapSource, options?: BillingRepositoryBootstrapOptions): BillingRepository;
