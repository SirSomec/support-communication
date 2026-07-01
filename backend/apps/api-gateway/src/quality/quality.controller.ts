import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { QualityService } from "./quality.service.js";

@ApiTags("quality")
@Controller("quality")
export class QualityController {
  constructor(private readonly qualityService: QualityService) {}

  @Get("workspace")
  @ApiOkResponse({ description: "Quality, AI scoring and coaching workspace envelope" })
  fetchQualityWorkspace() {
    return this.qualityService.fetchQualityWorkspace();
  }

  @Post("draft-score")
  @UseGuards(DemoServiceAdminGuard)
  @RequireServiceAdminAction("quality.scoring-audits.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Pre-send quality scoring envelope" })
  scoreDraftResponse(
    @Body()
    payload: {
      attachments?: Array<{ id?: string; status?: string }>;
      conversationId?: string;
      mode?: string;
      suggestions?: Array<Record<string, unknown>>;
      text?: string;
    }
  ) {
    return this.qualityService.scoreDraftResponse(payload);
  }

  @Post("draft-scores")
  @UseGuards(DemoServiceAdminGuard)
  @RequireServiceAdminAction("quality.scoring-audits.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Pre-send quality scoring envelope" })
  scoreDraftResponseAlias(
    @Body()
    payload: {
      attachments?: Array<{ id?: string; status?: string }>;
      conversationId?: string;
      mode?: string;
      suggestions?: Array<Record<string, unknown>>;
      text?: string;
    }
  ) {
    return this.qualityService.scoreDraftResponse(payload);
  }

  @Post("ratings")
  @UseGuards(DemoServiceAdminGuard)
  @RequireServiceAdminAction("quality.ratings.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Client quality rating envelope" })
  recordClientQualityRating(
    @Body()
    payload: {
      channel?: string;
      clientId?: string;
      conversationId?: string;
      operator?: string;
      scale?: "CSAT" | "CSI" | "QA";
      score?: number;
      topic?: string;
    }
  ) {
    return this.qualityService.recordClientQualityRating(payload);
  }

  @Post("manual-reviews")
  @UseGuards(DemoServiceAdminGuard)
  @RequireServiceAdminAction("quality.manual-reviews.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Manual QA review envelope" })
  recordManualQaReview(
    @Body()
    payload: {
      conversationId?: string;
      criteria?: Record<string, number>;
      overrideReason?: string;
      reviewer?: string;
      score?: number;
    }
  ) {
    return this.qualityService.recordManualQaReview(payload);
  }
}
