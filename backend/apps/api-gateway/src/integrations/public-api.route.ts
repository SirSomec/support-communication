import {
  handlePublicIdentifyUserRequest,
  type PublicApiEnvironment,
  type PublicApiKeyLookup
} from "./public-api-auth.js";

export function identifyPublicClientFromRoute(
  lookup: PublicApiKeyLookup,
  authorization: string | undefined,
  environment: PublicApiEnvironment = "production",
  payload: { externalId?: string; traits?: Record<string, unknown> } = {}
) {
  return handlePublicIdentifyUserRequest({
    authorization,
    environment,
    lookup,
    payload
  });
}
