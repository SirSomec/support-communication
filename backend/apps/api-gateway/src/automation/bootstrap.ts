import {
  configureRepositoryBootstrap,
  createPrismaClient,
  resolveRepositoryStoreFile,
  type PrismaClientFactoryOptions
} from "@support-communication/database";
import { AutomationRepository, type PrismaAutomationClient } from "./automation.repository.js";

export interface AutomationRepositoryBootstrapSource {
  AUTOMATION_REPOSITORY?: string;
  AUTOMATION_STORE_FILE?: string;
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface AutomationRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaAutomationClient;
}

export function configureAutomationRepository(
  source: AutomationRepositoryBootstrapSource = process.env,
  options: AutomationRepositoryBootstrapOptions = {}
): AutomationRepository {
  return configureRepositoryBootstrap({
    createJsonRepository: (filePath) => AutomationRepository.open({ filePath }),
    createPrismaRepository: (client) => AutomationRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "AUTOMATION_REPOSITORY",
    source,
    storeFileEnv: "AUTOMATION_STORE_FILE",
    suffix: "automation",
    useDefault: (repository) => AutomationRepository.useDefault(repository)
  });
}

export function resolveAutomationStoreFile(source: AutomationRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "AUTOMATION_STORE_FILE",
    suffix: "automation"
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaAutomationClient {
  return createPrismaClient(options) as PrismaAutomationClient;
}
