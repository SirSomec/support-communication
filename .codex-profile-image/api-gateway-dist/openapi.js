import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
const CLIENT_API_TAGS = new Set(["public", "open-channel"]);
const CLIENT_API_PATH = /^\/api\/v\d+\/(?:public|open-channel)(?:\/|$)/;
export function setupOpenApi(app, apiVersion, options = {}) {
    const config = new DocumentBuilder()
        .setTitle("Support Communication Backend API")
        .setDescription("Phase 0 API Gateway shell for backend services")
        .setVersion(apiVersion)
        .addBearerAuth()
        .build();
    const document = SwaggerModule.createDocument(app, config);
    if (options.clientOnly) {
        restrictToClientApi(document);
    }
    SwaggerModule.setup("api/docs", app, document);
}
/** Keeps the public production contract separate from internal service routes. */
function restrictToClientApi(document) {
    const paths = document.paths;
    for (const path of Object.keys(paths)) {
        const pathItem = paths[path];
        if (!pathItem || !CLIENT_API_PATH.test(path)) {
            delete paths[path];
            continue;
        }
        const clientOperations = Object.fromEntries(Object.entries(pathItem).filter(([method, operation]) => {
            if (method === "parameters" || !operation || typeof operation !== "object") {
                return false;
            }
            const tags = operation.tags;
            return Array.isArray(tags) && tags.some((tag) => CLIENT_API_TAGS.has(String(tag)));
        }));
        if (Object.keys(clientOperations).length === 0) {
            delete paths[path];
            continue;
        }
        paths[path] = clientOperations;
    }
    document.tags = (document.tags ?? []).filter((tag) => CLIENT_API_TAGS.has(tag.name));
}
//# sourceMappingURL=openapi.js.map