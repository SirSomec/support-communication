import { type PrismaClientFactoryOptions } from "@support-communication/database";
import { ReportRepository, type PrismaReportClient, type ReportState } from "./report.repository.js";
export interface ReportRepositoryBootstrapSource {
    DATABASE_URL?: string;
    NODE_ENV?: string;
    PORT?: number | string;
    SERVICE_NAME?: string;
}
export interface ReportRepositoryBootstrapOptions {
    prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaReportClient;
    seed?: ReportState;
}
export declare function configureReportRepository(source?: ReportRepositoryBootstrapSource, options?: ReportRepositoryBootstrapOptions): ReportRepository;
