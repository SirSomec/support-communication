import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import type { ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { QualityService, type QualityRequestContext } from "./quality.service.js";

@ApiTags("quality")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("quality")
export class QualityController {
  constructor(private readonly qualityService: QualityService) {}

  @Get("workspace")
  @RequireTenantOperatorPermission("quality.read")
  @RequireServiceAdminAction("quality.read")
  @ApiOkResponse({ description: "Quality, AI scoring and coaching workspace envelope" })
  fetchQualityWorkspace(@Req() request: TenantOperatorRequest) {
    return this.qualityService.fetchQualityWorkspace(qualityContextFromRequest(request));
  }

  @Post("draft-score")
  @RequireTenantOperatorPermission("quality.scoring-audits.write")
  @RequireServiceAdminAction("quality.scoring-audits.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Pre-send quality scoring envelope" })
  scoreDraftResponse(
    @Body()
    payload: {
      aiConsent?: boolean;
      attachments?: Array<{ id?: string; status?: string }>;
      channel?: string;
      conversationId?: string;
      idempotencyKey?: string;
      locale?: string;
      mode?: string;
      operatorId?: string;
      suggestions?: Array<Record<string, unknown>>;
      text?: string;
    },
    @Req() request: TenantOperatorRequest
  ) {
    return this.qualityService.scoreDraftResponse(payload, qualityContextFromRequest(request));
  }

  @Post("draft-scores")
  @RequireTenantOperatorPermission("quality.scoring-audits.write")
  @RequireServiceAdminAction("quality.scoring-audits.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Pre-send quality scoring envelope" })
  scoreDraftResponseAlias(
    @Body()
    payload: {
      aiConsent?: boolean;
      attachments?: Array<{ id?: string; status?: string }>;
      channel?: string;
      conversationId?: string;
      idempotencyKey?: string;
      locale?: string;
      mode?: string;
      operatorId?: string;
      suggestions?: Array<Record<string, unknown>>;
      text?: string;
    },
    @Req() request: TenantOperatorRequest
  ) {
    return this.qualityService.scoreDraftResponse(payload, qualityContextFromRequest(request));
  }

  @Post("ratings")
  @RequireTenantOperatorPermission("quality.ratings.write")
  @RequireServiceAdminAction("quality.ratings.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Client quality rating envelope" })
  recordClientQualityRating(
    @Body()
    payload: {
      channel?: string;
      clientId?: string;
      conversationId?: string;
      idempotencyKey?: string;
      operator?: string;
      scale?: "CSAT" | "CSI" | "QA";
      score?: number;
      topic?: string;
    },
    @Req() request: TenantOperatorRequest
  ) {
    return this.qualityService.recordClientQualityRating(payload, qualityContextFromRequest(request));
  }

  @Post("manual-reviews")
  @RequireTenantOperatorPermission("quality.manual-reviews.write")
  @RequireServiceAdminAction("quality.manual-reviews.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Manual QA review envelope" })
  recordManualQaReview(
    @Body()
    payload: {
      conversationId?: string;
      criteria?: Record<string, number>;
      idempotencyKey?: string;
      overrideReason?: string;
      reviewer?: string;
      score?: number;
    },
    @Req() request: TenantOperatorRequest
  ) {
    return this.qualityService.recordManualQaReview(payload, qualityContextFromRequest(request));
  }

  @Post("ai-suggestion-decisions")
  @RequireTenantOperatorPermission("quality.scoring-audits.write")
  @RequireServiceAdminAction("quality.scoring-audits.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Durable operator decision for an AI suggestion" })
  recordAiSuggestionDecision(
    @Body() payload: {
      action?: "accept" | "edit" | "reject";
      conversationId?: string;
      finalText?: string;
      originalText?: string;
      providerId?: string;
      providerResultId?: string;
      scoringAuditId?: string;
      suggestionId?: string;
    },
    @Req() request: TenantOperatorRequest
  ) {
    return this.qualityService.recordAiSuggestionDecision(payload, qualityContextFromRequest(request));
  }
}

function qualityContextFromRequest(request: TenantOperatorRequest): QualityRequestContext {
  const serviceAdminContext = (request as TenantOperatorRequest & ServiceAdminRequest).serviceAdminContext;
  const tenantId = request.tenantOperatorContext?.tenantId ?? serviceAdminContext?.currentTenantId;
  if (!tenantId) return {};
  if (request.tenantOperatorContext) {
    return {
      actorId: request.tenantOperatorContext.userId,
      actorType: "operator",
      tenantId
    };
  }
  return {
    actorId: serviceAdminContext?.actor.id,
    actorName: serviceAdminContext?.actor.name,
    actorType: "service_admin",
    tenantId
  };
}
