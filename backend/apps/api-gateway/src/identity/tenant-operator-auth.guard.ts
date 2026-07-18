import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IdentityRepository } from "./identity.repository.js";
import {
  TENANT_OPERATOR_PERMISSION_KEY,
  type TenantOperatorRequest,
  readBearerTokenFromAuthorization
} from "./tenant-operator-auth.js";

@Injectable()
export class TenantOperatorAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantOperatorRequest>();
    const requiredAction = this.reflector.getAllAndOverride<string | undefined>(TENANT_OPERATOR_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    const authorization = readHeader(request, "authorization");
    const bearerToken = readBearerTokenFromAuthorization(authorization);
    if (!bearerToken) {
      throw new UnauthorizedException("Bearer tenant operator session is required.");
    }

    const repository = IdentityRepository.default();
    const resolved = await repository.findTenantOperatorSessionByAccessToken(bearerToken);
    if (!resolved) {
      throw new UnauthorizedException("Tenant operator session is invalid or expired.");
    }

    if (requiredAction && !hasPermission(resolved.permissions, requiredAction)) {
      throw new ForbiddenException(`Tenant operator permission ${requiredAction} is required.`);
    }

    try {
      await repository.touchServiceAdminSessionActivity({ accessToken: bearerToken });
    } catch {
      // Продление сессии best-effort: сбой записи не должен валить авторизованный запрос.
    }

    request.tenantOperatorContext = {
      permissions: resolved.permissions,
      sessionId: resolved.session.id,
      tenantId: resolved.session.tenantId,
      userId: resolved.session.userId
    };
    return true;
  }
}

function readHeader(request: TenantOperatorRequest, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function hasPermission(permissions: string[], requiredAction: string): boolean {
  return permissions.includes("*") || permissions.includes(requiredAction);
}
