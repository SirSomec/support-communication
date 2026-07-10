import { configureRepositoryBootstrap, createPrismaClient, resolveRepositoryStoreFile, type PrismaClientFactoryOptions } from "@support-communication/database";
import { bootstrapReportState } from "./seed.js";
import { ReportRepository, type PrismaReportClient } from "./report.repository.js";

export interface ReportRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  REPORT_REPOSITORY?: string;
  REPORT_STORE_FILE?: string;
  SERVICE_NAME?: string;
}

export interface ReportRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaReportClient;
}

export function configureReportRepository(
  source: ReportRepositoryBootstrapSource = process.env,
  options: ReportRepositoryBootstrapOptions = {}
): ReportRepository {
  return configureRepositoryBootstrap({
    createJsonRepository: (filePath) => ReportRepository.open({ filePath, seed: bootstrapReportState() }),
    createPrismaRepository: (client) => ReportRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "REPORT_REPOSITORY",
    source,
    storeFileEnv: "REPORT_STORE_FILE",
    suffix: "reports",
    useDefault: (repository) => ReportRepository.useDefault(repository)
  });
}

export function resolveReportStoreFile(source: ReportRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "REPORT_STORE_FILE",
    suffix: "reports"
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaReportClient {
  return createPrismaClient(options) as PrismaReportClient;
}
