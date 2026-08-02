import { type PrismaClientFactoryOptions } from "@support-communication/database";
import { OperatorPresenceRepository, type PrismaOperatorPresenceClient } from "./operator-presence.repository.js";
export interface OperatorPresenceBootstrapSource {
    DATABASE_URL?: string;
    NODE_ENV?: string;
    PORT?: number | string;
    SERVICE_NAME?: string;
}
export interface OperatorPresenceBootstrapOptions {
    prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaOperatorPresenceClient;
}
export declare function configureOperatorPresenceRepository(source?: OperatorPresenceBootstrapSource, options?: OperatorPresenceBootstrapOptions): OperatorPresenceRepository;
