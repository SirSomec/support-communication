export * from "./seed-catalog.js";
import type { QualityState } from "./quality.repository.js";
export declare function bootstrapQualityState(base?: Partial<QualityState>): QualityState;
