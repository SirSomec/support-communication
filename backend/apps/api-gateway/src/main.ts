import "reflect-metadata";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { loadBackendConfig } from "@support-communication/config";
import { writeStructuredLog } from "@support-communication/observability";
import { AppModule } from "./app.module.js";
import { configureAutomationRepository } from "./automation/bootstrap.js";
import { configureBillingRepository } from "./billing/bootstrap.js";
import { configureConversationRealtimeFanout, configureConversationRepository } from "./conversation/bootstrap.js";
import { ConversationService } from "./conversation/conversation.service.js";
import { installRealtimeWebSocketReplay } from "./conversation/realtime.websocket.js";
import { EnvelopeHttpExceptionFilter } from "./http-exception.filter.js";
import { configureIdentityRepository } from "./identity/bootstrap.js";
import { configureIntegrationRepository } from "./integrations/bootstrap.js";
import { configureNotificationRepository } from "./notifications/bootstrap.js";
import { setupOpenApi } from "./openapi.js";
import { configureOpenChannelRepository } from "./integrations/open-channel/bootstrap.js";
import { startOpenChannelRuntime } from "./integrations/open-channel/open-channel-runtime.js";
import { configureOperationsRepository } from "./operations/bootstrap.js";
import { configurePlatformRepository } from "./platform/bootstrap.js";
import { configureOperatorPresenceRepository } from "./presence/bootstrap.js";
import { OperatorPresenceService } from "./presence/presence.service.js";
import { configureQualityRepository } from "./quality/bootstrap.js";
import { configureQualityScoringRepository } from "./quality/quality-scoring.bootstrap.js";
import { configureReportRepository } from "./reports/bootstrap.js";
import { configureRoutingRepository } from "./routing/bootstrap.js";
import { configureWorkspaceRepository } from "./workspace/bootstrap.js";
import type { Server } from "node:http";
import type { Socket } from "node:net";
import type { LocalDevelopmentRepositorySeeds } from "./runtime/local-development-seed.js";

export async function bootstrap(): Promise<void> {
  const config = loadBackendConfig();
  if (config.NODE_ENV === "production" && process.env.ALLOW_DEMO_SERVICE_ADMIN_HEADERS === "true") {
    throw new Error("Production startup blocked: ALLOW_DEMO_SERVICE_ADMIN_HEADERS must not be enabled.");
  }
  const localSeeds: LocalDevelopmentRepositorySeeds = config.LOCAL_DEVELOPMENT_SEED_ENABLED === "true"
    ? (await import("./runtime/local-development-seed.js")).createLocalDevelopmentRepositorySeeds()
    : (await import("./runtime/local-development-seed.js")).createPrismaCatalogFallbackSeeds();
  configureAutomationRepository(config, { seed: localSeeds.automation });
  configureIdentityRepository(config, { seed: localSeeds.identity });
  configureBillingRepository(config, { seed: localSeeds.billing });
  configureConversationRepository(config, { seed: localSeeds.conversation });
  configureConversationRealtimeFanout(config);
  configureWorkspaceRepository(config, { seed: localSeeds.workspace });
  const routingRepository = configureRoutingRepository(config, { seed: localSeeds.routing });
  await routingRepository.hydrateStateSnapshot();
  configureReportRepository(config, { seed: localSeeds.reports });
  configureIntegrationRepository(config, { seed: localSeeds.integrations });
  configureOpenChannelRepository(config);
  configureNotificationRepository(config);
  configurePlatformRepository(config, { seed: localSeeds.platform });
  configureOperatorPresenceRepository(config);
  OperatorPresenceService.configureRealtimeFanoutFromEnv(process.env);
  configureQualityRepository(config, { seed: localSeeds.quality });
  configureQualityScoringRepository(config);
  configureOperationsRepository(config, { seed: localSeeds.operations });
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });

  app.setGlobalPrefix(`api/${config.API_VERSION}`);
  app.useGlobalFilters(new EnvelopeHttpExceptionFilter());
  setupOpenApi(app, config.API_VERSION);
  const httpServer = app.getHttpServer() as Server;
  installHttpSocketErrorGuard(httpServer);
  installRealtimeWebSocketReplay(httpServer, {
    apiVersion: config.API_VERSION,
    config,
    conversationService: app.get(ConversationService)
  });
  await app.listen(config.PORT);
  startOpenChannelRuntime();

  writeStructuredLog("info", "API Gateway started", {
    operation: "bootstrap",
    port: config.PORT,
    service: config.SERVICE_NAME
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void bootstrap();
}

function installHttpSocketErrorGuard(server: Server): void {
  server.on("connection", (socket: Socket) => {
    socket.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNRESET") {
        return;
      }

      writeStructuredLog("warn", "HTTP socket error", {
        code: error.code,
        operation: "http.socket.error",
        service: "api-gateway"
      });
    });
  });
}
