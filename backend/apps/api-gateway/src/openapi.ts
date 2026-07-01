import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { INestApplication } from "@nestjs/common";

export function setupOpenApi(app: INestApplication, apiVersion: string): void {
  const config = new DocumentBuilder()
    .setTitle("Support Communication Backend API")
    .setDescription("Phase 0 API Gateway shell for backend services")
    .setVersion(apiVersion)
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);
}
