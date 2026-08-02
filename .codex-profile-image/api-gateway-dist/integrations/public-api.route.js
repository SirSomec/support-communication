import { handlePublicIdentifyUserRequest } from "./public-api-auth.js";
export function identifyPublicClientFromRoute(lookup, authorization, environment = "production", payload = {}) {
    return handlePublicIdentifyUserRequest({
        authorization,
        environment,
        lookup,
        payload
    });
}
//# sourceMappingURL=public-api.route.js.map