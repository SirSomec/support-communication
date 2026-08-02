import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { IdentityRepository } from "./identity.repository.js";
import { TeamDirectoryRepository } from "./team-directory.repository.js";
import { SettingsRulesRepository } from "./settings-rules.repository.js";
export function configureIdentityRepository(source = process.env, options = {}) {
    return configureRepositoryBootstrap({
        createPrismaRepository: (client) => {
            TeamDirectoryRepository.useDefault(TeamDirectoryRepository.prisma(client));
            SettingsRulesRepository.useDefault(SettingsRulesRepository.prisma(client));
            return IdentityRepository.prisma({ client });
        },
        prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
        source,
        useDefault: (repository) => IdentityRepository.useDefault(repository)
    });
}
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=bootstrap.js.map