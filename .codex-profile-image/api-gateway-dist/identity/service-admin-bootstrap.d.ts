import { IdentityRepository } from "./identity.repository.js";
export interface ServiceAdminBootstrapResult {
    outcome: "created" | "exists" | "skipped";
    subjectId?: string;
}
export declare function bootstrapServiceAdminFromEnv(source?: NodeJS.ProcessEnv, repository?: IdentityRepository): Promise<ServiceAdminBootstrapResult>;
