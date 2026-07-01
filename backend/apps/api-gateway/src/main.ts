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
import { setupOpenApi } from "./openapi.js";
import { configureOperationsRepository } from "./operations/bootstrap.js";
import { configurePlatformRepository } from "./platform/bootstrap.js";
import { configureReportRepository } from "./reports/bootstrap.js";
import { configureRoutingRepository } from "./routing/bootstrap.js";
import { configureWorkspaceRepository } from "./workspace/bootstrap.js";
import type { Server } from "node:http";
import type { Socket } from "node:net";

export async function bootstrap(): Promise<void> {
  const config = loadBackendConfig();
  configureAutomationRepository(config);
  configureIdentityRepository(config);
  configureBillingRepository(config);
  configureConversationRepository(config);
  configureConversationRealtimeFanout(config);
  configureWorkspaceRepository(config);
  configureRoutingRepository(config);
  configureReportRepository(config);
  configureIntegrationRepository(config);
  configurePlatformRepository(config);
  configureOperationsRepository(config);

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
