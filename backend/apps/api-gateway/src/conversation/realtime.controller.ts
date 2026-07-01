import { Controller, Get, Headers, Query, Sse, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Observable } from "rxjs";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { ConversationService } from "./conversation.service.js";
import { createRealtimeSseStream, type RealtimeSseMessage } from "./realtime.sse.js";

@ApiTags("realtime")
@UseGuards(DemoServiceAdminGuard)
@Controller("realtime")
export class RealtimeController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get("events")
  @RequireServiceAdminAction("realtime.events.read")
  @ApiOkResponse({ description: "Realtime event feed envelope for smoke and adapter compatibility" })
  fetchRealtimeEvents(@Query() filters: { since?: string }) {
    return this.conversationService.fetchRealtimeEvents(filters);
  }

  @Sse("events/stream")
  @RequireServiceAdminAction("realtime.events.read")
  @ApiOkResponse({ description: "Server-Sent Events stream for persisted realtime events" })
  streamRealtimeEvents(
    @Query() filters: { since?: string },
    @Headers("last-event-id") lastEventId?: string
  ): Observable<RealtimeSseMessage> {
    return createRealtimeSseStream(this.conversationService, filters, lastEventId);
  }
}
