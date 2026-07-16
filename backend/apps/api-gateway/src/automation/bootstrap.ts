import {
  configureRepositoryBootstrap,
  createPrismaClient,
  type PrismaClientFactoryOptions
} from "@support-communication/database";
import {
  AutomationRepository,
  type AutomationState,
  type PrismaAutomationClient
} from "./automation.repository.js";
import { ProactiveExposureRepository, type PrismaExposureClient } from "./proactive-exposure.repository.js";

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

export function configureAutomationRepository(
  source: AutomationRepositoryBootstrapSource = process.env,
  options: AutomationRepositoryBootstrapOptions = {}
): AutomationRepository {
  return configureRepositoryBootstrap({
    createPrismaRepository: (client) => {
      ProactiveExposureRepository.useDefault(ProactiveExposureRepository.prisma(client as unknown as PrismaExposureClient));
      return AutomationRepository.prisma({ client });
    },
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => AutomationRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaAutomationClient {
  return createPrismaClient(options) as PrismaAutomationClient;
}
