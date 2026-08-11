import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { INestApplication } from "@nestjs/common";

const CLIENT_API_TAGS = new Set(["public", "open-channel", "marketing"]);
const CLIENT_API_PATH = /^\/api\/v\d+\/(?:public|open-channel|marketing)(?:\/|$)/;

export function setupOpenApi(
  app: INestApplication,
  apiVersion: string,
  options: { clientOnly?: boolean } = {}
): void {
  const clientOnly = options.clientOnly === true;
  const config = new DocumentBuilder()
    .setTitle(clientOnly ? "Support Communication Client API" : "Support Communication API")
    .setDescription(clientOnly
      ? [
          "Публичный контракт Support Communication для Web SDK, Open Channel и внешних server-to-server вызовов.",
          "SDK-запросы используют Bearer public API key; Open Channel передаёт отдельный токен в пути.",
          "Ответы SDK возвращаются в едином envelope: проверяйте status и сохраняйте traceId для диагностики."
        ].join("\n\n")
      : "Полный контракт API Gateway для локальной разработки и внутренней интеграционной проверки.")
    .setVersion(apiVersion)
    .setExternalDoc("Руководство для разработчиков", "/#/docs")
    .addTag("public", "Web SDK, публичный каталог и server-to-server callbacks")
    .addTag("open-channel", "Кастомные двунаправленные каналы поддержки")
    .addTag("marketing", "Маркетинговые кампании, аудитории, согласия и API-ключ организации")
    .addTag("Marketing campaigns", "Черновики, запуск, пауза, отмена и результаты кампаний")
    .addTag("Audiences", "Статические аудитории, импорт и CRM-снимки")
    .addTag("Preferences", "Согласия и отписки получателей")
    .addTag("Marketing analytics", "Статусы доставки и экспорт результатов")
    .addTag("CRM audience sync", "Подписанные входящие CRM-снимки с защитой от повторов")
    .addBearerAuth({
      bearerFormat: "public API key or access token",
      description: "For Web SDK endpoints use Bearer sk_live_… or sk_test_…. Marketing endpoints require an organization owner key: Bearer mk_live_….",
      scheme: "bearer",
      type: "http"
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  if (clientOnly) {
    restrictToClientApi(document);
  }
  SwaggerModule.setup("api/docs", app, document, {
    customSiteTitle: clientOnly ? "Support Communication — Client API" : "Support Communication — API",
    swaggerOptions: {
      displayOperationId: true,
      filter: true,
      operationsSorter: "method",
      persistAuthorization: false,
      tagsSorter: "alpha"
    }
  });
}

/** Keeps the public production contract separate from internal service routes. */
function restrictToClientApi(document: ReturnType<typeof SwaggerModule.createDocument>): void {
  const paths = document.paths as Record<string, Record<string, unknown> | undefined>;

  for (const path of Object.keys(paths)) {
    const pathItem = paths[path];
    if (!pathItem || !CLIENT_API_PATH.test(path)) {
      delete paths[path];
      continue;
    }
    const clientOperations = Object.fromEntries(
      Object.entries(pathItem).filter(([method, operation]) => {
        if (method === "parameters" || !operation || typeof operation !== "object") {
          return false;
        }
        const tags = (operation as { tags?: unknown }).tags;
        return Array.isArray(tags) && tags.some((tag) => CLIENT_API_TAGS.has(String(tag)));
      })
    );
    if (Object.keys(clientOperations).length === 0) {
      delete paths[path];
      continue;
    }
    paths[path] = clientOperations;
  }

  document.tags = (document.tags ?? []).filter((tag) => CLIENT_API_TAGS.has(tag.name));
  pruneUnusedSchemas(document);
}

/** Removes internal DTO components that are no longer reachable from the client-only paths. */
function pruneUnusedSchemas(document: ReturnType<typeof SwaggerModule.createDocument>): void {
  const schemas = document.components?.schemas;
  if (!schemas) return;

  const referenced = new Set<string>();
  collectSchemaRefs(document.paths, referenced);

  const pending = [...referenced];
  while (pending.length) {
    const schemaName = pending.pop();
    if (!schemaName) continue;
    const before = referenced.size;
    collectSchemaRefs(schemas[schemaName], referenced);
    if (referenced.size > before) {
      for (const candidate of referenced) {
        if (!pending.includes(candidate) && candidate !== schemaName) pending.push(candidate);
      }
    }
  }

  for (const schemaName of Object.keys(schemas)) {
    if (!referenced.has(schemaName)) delete schemas[schemaName];
  }
}

function collectSchemaRefs(value: unknown, target: Set<string>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaRefs(item, target);
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (key === "$ref" && typeof item === "string" && item.startsWith("#/components/schemas/")) {
      target.add(item.slice("#/components/schemas/".length).replaceAll("~1", "/").replaceAll("~0", "~"));
      continue;
    }
    collectSchemaRefs(item, target);
  }
}
