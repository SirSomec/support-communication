import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IdentityRepository } from "./identity.repository.js";
import { createPrismaClient } from "@support-communication/database";
import { createHash } from "node:crypto";
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
    const marketingKey = !resolved && isMarketingRequest(request) && bearerToken.startsWith("mk_live_")
      ? await resolveMarketingApiKey(bearerToken)
      : null;
    if (!resolved && !marketingKey) {
      throw new UnauthorizedException("Tenant operator session is invalid or expired.");
    }

    if (marketingKey) {
      enforceMarketingApiRateLimit(marketingKey.id);
      request.tenantOperatorContext = {
        permissions: ["marketing.access"],
        sessionId: `marketing_api_key:${marketingKey.id}`,
        tenantId: marketingKey.tenantId,
        userId: marketingKey.createdBy
      };
      return true;
    }
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

const prisma = createPrismaClient() as any;
const marketingKeyRequests = new Map<string, number[]>();
async function resolveMarketingApiKey(token: string): Promise<{ id: string; tenantId: string; createdBy: string } | null> {
  const key = await prisma.marketingApiKey.findFirst({ where: { keyHash: createHash("sha256").update(token).digest("hex"), revokedAt: null }, select: { id: true, tenantId: true, createdBy: true } });
  if (key) await prisma.marketingApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return key;
}
function isMarketingRequest(request: TenantOperatorRequest): boolean {
  return String((request as any).url ?? "").includes("/marketing");
}
function enforceMarketingApiRateLimit(keyId: string): void {
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (marketingKeyRequests.get(keyId) ?? []).filter((timestamp) => timestamp > windowStart);
  if (recent.length >= 300) throw new HttpException("Marketing API limit is 300 requests per minute.", HttpStatus.TOO_MANY_REQUESTS);
  recent.push(now);
  marketingKeyRequests.set(keyId, recent);
}

function readHeader(request: TenantOperatorRequest, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function hasPermission(permissions: string[], requiredAction: string): boolean {
  return permissions.includes("*") || permissions.includes(requiredAction);
}
