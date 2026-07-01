import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { loadBackendConfig, type BackendConfig } from "@support-communication/config";
import { type BackendEnvelope } from "@support-communication/envelope";
import {
  buildHealthEnvelope,
  buildReadinessEnvelope,
  type HealthResponse,
  type ReadinessResponse
} from "./health.response.js";

@ApiTags("platform")
@Controller()
export class HealthController {
  private readonly config: BackendConfig = loadBackendConfig();

  @Get("health")
  @ApiOkResponse({ description: "API Gateway liveness envelope" })
  health(requestId?: string): BackendEnvelope<HealthResponse> {
    return buildHealthEnvelope(this.config, requestId);
  }

  @Get("ready")
  @ApiOkResponse({ description: "API Gateway readiness envelope" })
  ready(requestId?: string): BackendEnvelope<ReadinessResponse> {
    return buildReadinessEnvelope(this.config, requestId);
  }
}
