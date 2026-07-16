import { configureRepositoryBootstrap, createPrismaClient, type PrismaClientFactoryOptions } from "@support-communication/database";
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

export function configureReportRepository(
  source: ReportRepositoryBootstrapSource = process.env,
  options: ReportRepositoryBootstrapOptions = {}
): ReportRepository {
  return configureRepositoryBootstrap({
    createPrismaRepository: (client) => ReportRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => ReportRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaReportClient {
  return createPrismaClient(options) as PrismaReportClient;
}
