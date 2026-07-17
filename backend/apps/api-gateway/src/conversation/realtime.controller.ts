import { Controller, Get, Headers, Query, Req, Sse, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Observable } from "rxjs";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { ConversationService } from "./conversation.service.js";
import { createRealtimeSseStream, type RealtimeSseMessage } from "./realtime.sse.js";
import { TenantOperatorOrServiceAdminGuard } from "./tenant-operator-or-service-admin.guard.js";

@ApiTags("realtime")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("realtime")
export class RealtimeController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get("events")
  @RequireTenantOperatorPermission("realtime.events.read")
  @RequireServiceAdminAction("realtime.events.read")
  @ApiOkResponse({ description: "Realtime event feed envelope for smoke and adapter compatibility" })
  fetchRealtimeEvents(@Query() filters: { limit?: string; since?: string }, @Req() request: TenantOperatorRequest) {
    return this.conversationService.fetchRealtimeEvents(filters, {
      tenantId: request.tenantOperatorContext?.tenantId
    });
  }

  @Sse("events/stream")
  @RequireTenantOperatorPermission("realtime.events.read")
  @RequireServiceAdminAction("realtime.events.read")
  @ApiOkResponse({ description: "Server-Sent Events stream for persisted realtime events" })
  streamRealtimeEvents(
    @Query() filters: { limit?: string; since?: string },
    @Headers("last-event-id") lastEventId?: string,
    @Req() request?: TenantOperatorRequest
  ): Observable<RealtimeSseMessage> {
    return createRealtimeSseStream(this.conversationService, {
      ...filters,
      ...(request?.tenantOperatorContext?.tenantId
        ? { tenantId: request.tenantOperatorContext.tenantId }
        : {})
    }, lastEventId, {
      keepOpen: true,
      includeHandshake: true
    });
  }
}
