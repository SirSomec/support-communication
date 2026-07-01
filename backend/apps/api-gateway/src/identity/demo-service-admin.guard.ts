import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { resolveServiceAdminContextAsync } from "@support-communication/auth-context";
import { loadBackendConfig } from "@support-communication/config";
import { makeAuditId } from "./backend-ids.js";
import { IdentityRepository, type IdentityPermissionRole, type StoredServiceAdminSession } from "./identity.repository.js";
import { identityTraceId } from "./identity-meta.js";
import { SERVICE_ADMIN_ACTION_KEY, type ServiceAdminRequest } from "./service-admin-auth.js";

@Injectable()
export class DemoServiceAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ServiceAdminRequest>();
    const requiredAction = this.reflector.getAllAndOverride<string | undefined>(SERVICE_ADMIN_ACTION_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    const authorization = readHeader(request, "authorization");

    if (/^Bearer\s+/i.test(authorization)) {
      const bearerToken = readBearerToken(authorization);
      if (!bearerToken) {
        throw new UnauthorizedException("Bearer service-admin session is required for privileged identity endpoints.");
      }

      const repository = IdentityRepository.default();
      let resolvedSession: StoredServiceAdminSession | null = null;
      const decision = await resolveServiceAdminContextAsync({
        headers: request.headers,
        requiredAction,
        sessionLookup: async (token) => {
          resolvedSession = (await repository.findServiceAdminSessionByAccessToken(token))
            ?? await repository.findServiceAdminSession(token)
            ?? null;
          return resolvedSession;
        }
      });

      if (!decision.allowed) {
        if (decision.code === "permission_denied" && requiredAction) {
          const deniedSession = await repository.findServiceAdminSessionByAccessToken(bearerToken)
            ?? await repository.findServiceAdminSession(bearerToken);
          const activePolicy = await repository.getActiveRbacPolicyVersion();
          const roleKey = resolvePermissionRoleKey(deniedSession?.role ?? "service_admin", await repository.listPermissionRoles());
          await repository.recordPermissionDenialEvent({
            action: requiredAction,
            actorId: deniedSession?.actorId ?? null,
            at: new Date().toISOString(),
            id: makeAuditId("rbac_denial"),
            immutable: true,
            policyVersionId: activePolicy?.id ?? null,
            reason: "Service-admin session does not include the required action.",
            resource: "service-admin",
            roleKey,
            tenantId: null,
            traceId: identityTraceId("serviceAdminGuard", "permissionDenied")
          });
        }
        const message = `Service-admin session denied: ${decision.code}`;
        if (decision.status === "unauthorized") {
          throw new UnauthorizedException(message);
        }

        throw new ForbiddenException(message);
      }

      const contextRoles = resolvedSession ? [(resolvedSession as StoredServiceAdminSession).role] : [];

      request.serviceAdminContext = {
        actor: decision.actor,
        ...(decision.currentTenantId ? { currentTenantId: decision.currentTenantId } : {}),
        permissions: decision.permissions,
        ...(contextRoles.length ? { roles: contextRoles } : {}),
        sessionId: decision.sessionId
      };

      return true;
    }

    const config = loadBackendConfig();
    if (!["development", "test"].includes(config.NODE_ENV) && process.env.ALLOW_DEMO_SERVICE_ADMIN_HEADERS !== "true") {
      throw new UnauthorizedException("Bearer service-admin session is required for privileged identity endpoints.");
    }

    const expectedKey = config.DEMO_SERVICE_ADMIN_KEY;
    const header = request.headers["x-demo-service-admin-key"];
    const providedKey = Array.isArray(header) ? header[0] : header;

    if (providedKey !== expectedKey) {
      throw new UnauthorizedException("Demo service-admin key is required for privileged identity endpoints.");
    }

    if (!requiredAction) {
      return true;
    }

    const actorId = readHeader(request, "x-demo-service-admin-actor-id");
    const actorName = readHeader(request, "x-demo-service-admin-actor-name");
    const currentTenantId = readHeader(request, "x-demo-service-admin-tenant-id");
    const mfaVerified = readHeader(request, "x-demo-service-admin-mfa-verified") === "true";
    const sessionExpiresAt = Date.parse(readHeader(request, "x-demo-service-admin-session-expires-at"));
    const roles = readHeader(request, "x-demo-service-admin-roles")
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);
    const permissions = readHeader(request, "x-demo-service-admin-permissions")
      .split(",")
      .map((permission) => permission.trim())
      .filter(Boolean);

    if (!actorId || !actorName) {
      throw new ForbiddenException("A named service-admin actor is required for this operation.");
    }

    if (!mfaVerified || !Number.isFinite(sessionExpiresAt) || sessionExpiresAt <= Date.now()) {
      throw new ForbiddenException("A verified, non-expired service-admin session is required for this operation.");
    }

    if (!permissions.includes("*") && !permissions.includes(requiredAction)) {
      throw new ForbiddenException(`Service-admin permission ${requiredAction} is required for this operation.`);
    }

    request.serviceAdminContext = {
      actor: {
        id: actorId,
        name: actorName
      },
      ...(currentTenantId ? { currentTenantId } : {}),
      permissions,
      ...(roles.length ? { roles } : {})
    };

    return true;
  }
}

function readHeader(request: ServiceAdminRequest, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readBearerToken(authorization: string): string {
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() ?? "";
}

function resolvePermissionRoleKey(role: string, permissionRoles: IdentityPermissionRole[]): string | null {
  const value = role.trim().toLowerCase();
  const permissionRole = permissionRoles.find((item) =>
    item.key.toLowerCase() === value ||
    item.aliases.some((alias) => alias.toLowerCase() === value)
  );
  return permissionRole?.key ?? null;
}
