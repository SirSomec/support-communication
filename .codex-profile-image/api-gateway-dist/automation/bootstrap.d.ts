import { type PrismaClientFactoryOptions } from "@support-communication/database";
import { AutomationRepository, type AutomationState, type PrismaAutomationClient } from "./automation.repository.js";
export interface AutomationRepositoryBootstrapSource {
    DATABASE_URL?: string;
    NODE_ENV?: string;
    PORT?: number | string;
    SERVICE_NAME?: string;
}
export interface AutomationRepositoryBootstrapOptions {
    prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaAutomationClient;
    seed?: AutomationState;
}
export declare function configureAutomationRepository(source?: AutomationRepositoryBootstrapSource, options?: AutomationRepositoryBootstrapOptions): AutomationRepository;
