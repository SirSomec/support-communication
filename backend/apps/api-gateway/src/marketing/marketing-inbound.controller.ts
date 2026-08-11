import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { MarketingService } from "./marketing.service.js";

@ApiTags("marketing", "CRM audience sync")
@Controller("marketing/inbound")
export class MarketingInboundController {
  constructor(private readonly marketingService: MarketingService) {}

  @Post("crm/:syncId")
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: "syncId" })
  @ApiHeader({ name: "X-Marketing-CRM-Secret", required: true, description: "Secret issued by the tenant owner when creating the CRM audience sync" })
  @ApiHeader({ name: "X-Marketing-Event-Id", required: true, description: "Unique CRM event ID retained for replay protection" })
  @ApiHeader({ name: "X-Marketing-Timestamp", required: true, description: "Unix timestamp in milliseconds; accepted within five minutes" })
  @ApiHeader({ name: "X-Marketing-Signature", required: true, description: "HMAC-SHA256(secret, `${timestamp}.${eventId}.${canonical JSON body}`)" })
  @ApiOperation({ operationId: "syncMarketingAudienceFromCrm", summary: "Replace CRM-managed audience members with exact matches to existing client profiles using signed, replay-safe snapshots" })
  sync(
    @Param("syncId") syncId: string,
    @Headers("x-marketing-crm-secret") secret: string | undefined,
    @Headers("x-marketing-event-id") eventId: string | undefined,
    @Headers("x-marketing-timestamp") timestamp: string | undefined,
    @Headers("x-marketing-signature") signature: string | undefined,
    @Body() body: Record<string, unknown>
  ) {
    return this.marketingService.syncAudienceFromCrm(syncId, String(secret ?? ""), String(eventId ?? ""), String(timestamp ?? ""), String(signature ?? ""), body ?? {});
  }
}
