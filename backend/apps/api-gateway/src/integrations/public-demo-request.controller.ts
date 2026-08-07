import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PublicDemoRequestService, type PublicDemoRequestPayload } from "./public-demo-request.service.js";
import { ApiPublicEnvelope, PUBLIC_DEMO_REQUEST_BODY_SCHEMA } from "./public-api.openapi.js";

interface PublicDemoRequestHttpRequest {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
}

@ApiTags("public")
@Controller("public/demo-requests")
export class PublicDemoRequestController {
  constructor(private readonly publicDemoRequestService: PublicDemoRequestService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: "Accepts unauthenticated public landing demo/contact requests and queues a lead notification descriptor.",
    operationId: "createPublicDemoRequest",
    summary: "Create a public demo request"
  })
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "Stable key for retrying the same lead request safely" })
  @ApiBody({ schema: PUBLIC_DEMO_REQUEST_BODY_SCHEMA })
  @ApiPublicEnvelope("Public demo request envelope with sanitized lead id, duplicate state and notification descriptor.")
  createDemoRequest(
    @Body() payload: PublicDemoRequestPayload = {},
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Req() request: PublicDemoRequestHttpRequest
  ) {
    return this.publicDemoRequestService.createDemoRequest(payload, {
      idempotencyKey,
      ip: requestIp(request),
      userAgent
    });
  }
}

function requestIp(request: PublicDemoRequestHttpRequest): string | undefined {
  const forwarded = firstHeaderValue(request.headers?.["x-forwarded-for"]);
  if (forwarded) {
    return forwarded.split(",")[0]?.trim();
  }

  return request.ip ?? request.socket?.remoteAddress;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
