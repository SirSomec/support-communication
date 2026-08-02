import type { IntegrationState, IntegrationWorkspaceCatalog } from "./integration.repository.js";
export declare function bootstrapIntegrationWorkspaceCatalog(): IntegrationWorkspaceCatalog;
export declare function bootstrapIntegrationState(base?: Partial<IntegrationState>): IntegrationState;
export * from "./seed-catalog.js";
