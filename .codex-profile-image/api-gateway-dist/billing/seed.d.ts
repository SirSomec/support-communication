export * from "./seed-catalog.js";
import type { BillingState } from "./billing.repository.js";
import { BillingRepository } from "./billing.repository.js";
export declare function bootstrapBillingState(base?: Partial<BillingState>): BillingState;
export declare function createSeededBillingRepository(base?: Partial<BillingState>): BillingRepository;
