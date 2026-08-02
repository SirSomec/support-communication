export * from "./seed-catalog.js";
import type { PlatformState } from "./platform.repository.js";
export declare function bootstrapPlatformState(base?: Partial<PlatformState>): PlatformState;
