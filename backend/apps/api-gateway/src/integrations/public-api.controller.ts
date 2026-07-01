import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  type PublicApiEnvironment,
  type PublicApiKeyLookup
} from "./public-api-auth.js";
import { identifyPublicClientFromRoute } from "./public-api.route.js";

@ApiTags("public")
@ApiBearerAuth()
@Controller("public")
export class PublicApiController {
  protected readonly lookup: PublicApiKeyLookup = runtimePublicApiKeyLookup();

  @Post("sdk/identify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: "Public SDK identify runtime endpoint; denial envelopes include rate-limit metadata.",
    operationId: "identifyPublicSdkClient",
    summary: "Identify a public SDK client"
  })
  @ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" })
  @ApiOkResponse({ description: "Public SDK identify envelope guarded by public API key auth" })
  identifyPublicClient(
    @Headers("authorization") authorization: string | undefined,
    @Query("environment") environment: PublicApiEnvironment = "production",
    @Body() payload: { externalId?: string; traits?: Record<string, unknown> } = {}
  ) {
    return identifyPublicClientFromRoute(this.lookup, authorization, environment, payload);
  }
}

function runtimePublicApiKeyLookup(): PublicApiKeyLookup {
  return {
    async listActiveKeys() {
      return [];
    }
  };
}
