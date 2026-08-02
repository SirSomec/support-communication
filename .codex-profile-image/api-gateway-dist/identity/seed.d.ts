export * from "./seed-catalog.js";
import { IdentityRepository, type IdentityState } from "./identity.repository.js";
export declare function bootstrapIdentityState(base?: Partial<IdentityState>): IdentityState;
export declare function createSeededIdentityRepository(base?: Partial<IdentityState>): IdentityRepository;
