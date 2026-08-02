import type { INestApplication } from "@nestjs/common";
export declare function setupOpenApi(app: INestApplication, apiVersion: string, options?: {
    clientOnly?: boolean;
}): void;
