import { Controller, Get, Header } from "@nestjs/common";
import { renderRuntimeMetrics } from "./metrics.response.js";

@Controller()
export class MetricsController {
  @Get("metrics")
  @Header("Cache-Control", "no-store")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  metrics(): string {
    return renderRuntimeMetrics();
  }
}
