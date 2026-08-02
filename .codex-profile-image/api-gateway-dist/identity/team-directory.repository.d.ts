export interface TeamDirectoryRecord {
    channels: string[];
    id: string;
    memberIds: string[];
    name: string;
    scope: string;
    status: string;
    tenantId: string;
    updatedAt: string;
}
interface TeamDirectoryPrismaClient {
    team: {
        deleteMany(input: {
            where: {
                id: string;
                tenantId: string;
            };
        }): Promise<{
            count: number;
        }>;
        findMany(input: {
            include: {
                memberships: {
                    where: {
                        active: true;
                    };
                };
            };
            orderBy: {
                name: "asc";
            };
            where: {
                tenantId: string;
            };
        }): Promise<Array<Record<string, any>>>;
        upsert(input: {
            create: Record<string, unknown>;
            update: Record<string, unknown>;
            where: {
                tenantId_id: {
                    id: string;
                    tenantId: string;
                };
            };
        }): Promise<unknown>;
    };
    teamMembership: {
        createMany(input: {
            data: Array<Record<string, unknown>>;
            skipDuplicates: true;
        }): Promise<unknown>;
        deleteMany(input: {
            where: {
                teamId: string;
                tenantId: string;
            };
        }): Promise<unknown>;
        findFirst(input: {
            orderBy: {
                createdAt: "asc";
            };
            where: {
                active: true;
                operatorId: string;
                tenantId: string;
            };
        }): Promise<{
            teamId: string;
        } | null>;
    };
    $transaction<T>(callback: (client: TeamDirectoryPrismaClient) => Promise<T>): Promise<T>;
}
export declare class TeamDirectoryRepository {
    private readonly adapter;
    private constructor();
    static default(): TeamDirectoryRepository;
    static useDefault(repository: TeamDirectoryRepository): void;
    static inMemory(): TeamDirectoryRepository;
    static prisma(client: TeamDirectoryPrismaClient): TeamDirectoryRepository;
    deleteTeam(tenantId: string, teamId: string): Promise<boolean>;
    listTeams(tenantId: string): Promise<TeamDirectoryRecord[]>;
    findActiveTeamId(tenantId: string, operatorId: string): Promise<string | undefined>;
    saveTeam(team: TeamDirectoryRecord): Promise<TeamDirectoryRecord>;
}
export {};
