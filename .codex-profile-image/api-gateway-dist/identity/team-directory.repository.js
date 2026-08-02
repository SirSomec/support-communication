let defaultRepository = null;
export class TeamDirectoryRepository {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    static default() {
        defaultRepository ??= TeamDirectoryRepository.inMemory();
        return defaultRepository;
    }
    static useDefault(repository) {
        defaultRepository = repository;
    }
    static inMemory() {
        const teams = new Map();
        return new TeamDirectoryRepository({
            async deleteTeam(tenantId, teamId) {
                return teams.delete(key(tenantId, teamId));
            },
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
    static prisma(client) {
        return new TeamDirectoryRepository({
            async deleteTeam(tenantId, teamId) {
                let removed = false;
                await client.$transaction(async (transaction) => {
                    await transaction.teamMembership.deleteMany({ where: { teamId, tenantId } });
                    const result = await transaction.team.deleteMany({ where: { id: teamId, tenantId } });
                    removed = result.count > 0;
                });
                return removed;
            },
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
                    memberIds: Array.isArray(row.memberships) ? row.memberships.map((membership) => String(membership.operatorId)) : [],
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
    deleteTeam(tenantId, teamId) {
        return this.adapter.deleteTeam(tenantId, teamId);
    }
    listTeams(tenantId) {
        return this.adapter.listTeams(tenantId);
    }
    findActiveTeamId(tenantId, operatorId) {
        return this.adapter.findActiveTeamId(tenantId, operatorId);
    }
    saveTeam(team) {
        return this.adapter.saveTeam(team);
    }
}
function key(tenantId, teamId) {
    return `${tenantId}:${teamId}`;
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=team-directory.repository.js.map