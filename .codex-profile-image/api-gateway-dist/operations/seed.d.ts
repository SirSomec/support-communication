export * from "./seed-catalog.js";
import type { OperationsState } from "./operations.repository.js";
export declare function bootstrapOperationsState(base?: Partial<OperationsState>): OperationsState;
