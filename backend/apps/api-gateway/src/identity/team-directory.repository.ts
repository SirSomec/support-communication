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
    findMany(input: { include: { memberships: { where: { active: true } } }; orderBy: { name: "asc" }; where: { tenantId: string } }): Promise<Array<Record<string, any>>>;
    upsert(input: { create: Record<string, unknown>; update: Record<string, unknown>; where: { tenantId_id: { id: string; tenantId: string } } }): Promise<unknown>;
  };
  teamMembership: {
    createMany(input: { data: Array<Record<string, unknown>>; skipDuplicates: true }): Promise<unknown>;
    deleteMany(input: { where: { teamId: string; tenantId: string } }): Promise<unknown>;
    findFirst(input: { orderBy: { createdAt: "asc" }; where: { active: true; operatorId: string; tenantId: string } }): Promise<{ teamId: string } | null>;
  };
  $transaction<T>(callback: (client: TeamDirectoryPrismaClient) => Promise<T>): Promise<T>;
}

interface TeamDirectoryAdapter {
  findActiveTeamId(tenantId: string, operatorId: string): Promise<string | undefined>;
  listTeams(tenantId: string): Promise<TeamDirectoryRecord[]>;
  saveTeam(team: TeamDirectoryRecord): Promise<TeamDirectoryRecord>;
}

let defaultRepository: TeamDirectoryRepository | null = null;

export class TeamDirectoryRepository {
  private constructor(private readonly adapter: TeamDirectoryAdapter) {}

  static default(): TeamDirectoryRepository {
    defaultRepository ??= TeamDirectoryRepository.inMemory();
    return defaultRepository;
  }

  static useDefault(repository: TeamDirectoryRepository): void {
    defaultRepository = repository;
  }

  static inMemory(): TeamDirectoryRepository {
    const teams = new Map<string, TeamDirectoryRecord>();
    return new TeamDirectoryRepository({
      async findActiveTeamId(tenantId, operatorId) {
        return [...teams.values()].find((team) => team.tenantId === tenantId && team.memberIds.includes(operatorId))?.id;
      },
      async listTeams(tenantId) {
        return clone([...teams.values()].filter((team) => team.tenantId === tenantId));
      },
      async saveTeam(team) {
        teams.set(key(team.tenantId, team.id), clone(team));
        return clone(team);
      }
    });
  }

  static prisma(client: TeamDirectoryPrismaClient): TeamDirectoryRepository {
    return new TeamDirectoryRepository({
      async findActiveTeamId(tenantId, operatorId) {
        const membership = await client.teamMembership.findFirst({
          orderBy: { createdAt: "asc" },
          where: { active: true, operatorId, tenantId }
        });
        return membership?.teamId;
      },
      async listTeams(tenantId) {
        const rows = await client.team.findMany({
          include: { memberships: { where: { active: true } } },
          orderBy: { name: "asc" },
          where: { tenantId }
        });
        return rows.map((row) => ({
          channels: Array.isArray(row.channels) ? row.channels.map(String) : [],
          id: String(row.id),
          memberIds: Array.isArray(row.memberships) ? row.memberships.map((membership: any) => String(membership.operatorId)) : [],
          name: String(row.name),
          scope: String(row.scope),
          status: String(row.status),
          tenantId: String(row.tenantId),
          updatedAt: new Date(row.updatedAt).toISOString()
        }));
      },
      async saveTeam(team) {
        await client.$transaction(async (transaction) => {
          await transaction.team.upsert({
            create: {
              channels: team.channels,
              id: team.id,
              name: team.name,
              scope: team.scope,
              status: team.status,
              tenantId: team.tenantId,
              updatedAt: new Date(team.updatedAt)
            },
            update: {
              channels: team.channels,
              name: team.name,
              scope: team.scope,
              status: team.status,
              updatedAt: new Date(team.updatedAt)
            },
            where: { tenantId_id: { id: team.id, tenantId: team.tenantId } }
          });
          await transaction.teamMembership.deleteMany({ where: { teamId: team.id, tenantId: team.tenantId } });
          if (team.memberIds.length) {
            await transaction.teamMembership.createMany({
              data: team.memberIds.map((operatorId) => ({
                active: true,
                id: `tm_${team.tenantId}_${team.id}_${operatorId}`,
                operatorId,
                role: "member",
                teamId: team.id,
                tenantId: team.tenantId,
                updatedAt: new Date(team.updatedAt)
              })),
              skipDuplicates: true
            });
          }
        });
        return clone(team);
      }
    });
  }

  listTeams(tenantId: string): Promise<TeamDirectoryRecord[]> {
    return this.adapter.listTeams(tenantId);
  }

  findActiveTeamId(tenantId: string, operatorId: string): Promise<string | undefined> {
    return this.adapter.findActiveTeamId(tenantId, operatorId);
  }

  saveTeam(team: TeamDirectoryRecord): Promise<TeamDirectoryRecord> {
    return this.adapter.saveTeam(team);
  }
}

function key(tenantId: string, teamId: string): string {
  return `${tenantId}:${teamId}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
