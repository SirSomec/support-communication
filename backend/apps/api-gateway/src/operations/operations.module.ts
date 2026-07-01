import { Module } from "@nestjs/common";
import { OperationsController } from "./operations.controller.js";
import { OperationsReadinessService } from "./operations-readiness.service.js";

@Module({
  controllers: [OperationsController],
  providers: [OperationsReadinessService],
  exports: [OperationsReadinessService]
})
export class OperationsModule {}
