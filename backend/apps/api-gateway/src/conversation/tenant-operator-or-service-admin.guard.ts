import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { TenantOperatorAuthGuard } from "../identity/tenant-operator-auth.guard.js";
import { readBearerTokenFromAuthorization, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";

@Injectable()
export class TenantOperatorOrServiceAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantOperatorRequest & {
      query?: Record<string, string | string[] | undefined>;
      route?: { path?: string };
      url?: string;
    }>();
    const bearerToken = resolveBearerTokenForRequest(context, request);

    if (bearerToken) {
      request.headers.authorization = `Bearer ${bearerToken}`;
      try {
        return await new TenantOperatorAuthGuard(this.reflector).canActivate(context);
      } catch (error) {
        if (error instanceof ForbiddenException) {
          throw error;
        }
      }
    }

    return new ServiceAdminSessionGuard(this.reflector).canActivate(context);
  }
}

function resolveBearerTokenForRequest(
  context: ExecutionContext,
  request: TenantOperatorRequest & {
    query?: Record<string, string | string[] | undefined>;
    route?: { path?: string };
    url?: string;
  }
): string {
  const authorization = readHeader(request, "authorization");
  const bearerToken = readBearerTokenFromAuthorization(authorization);
  if (bearerToken) {
    return bearerToken;
  }

  if (!isRealtimeSseRoute(request) || !isRealtimeSseQueryTokenEnabled()) {
    return "";
  }

  // Staging-only fallback: EventSource cannot set Authorization headers.
  return readQueryAccessToken(request.query);
}

function isRealtimeSseRoute(request: { route?: { path?: string }; url?: string }): boolean {
  const routePath = request.route?.path ?? "";
  if (routePath === "events/stream") {
    return true;
  }
  return String(request.url ?? "").includes("/realtime/events/stream");
}

function isRealtimeSseQueryTokenEnabled(): boolean {
  // PILOT_SSE_QUERY_TOKEN — устаревшее имя, поддерживается один релиз.
  const configured = process.env.REALTIME_SSE_QUERY_TOKEN ?? process.env.PILOT_SSE_QUERY_TOKEN;
  return String(configured ?? "").trim().toLowerCase() === "true";
}

function readQueryAccessToken(query?: Record<string, string | string[] | undefined>): string {
  if (!query) {
    return "";
  }
  const raw = query.accessToken;
  return Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
}

function readHeader(request: TenantOperatorRequest, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
