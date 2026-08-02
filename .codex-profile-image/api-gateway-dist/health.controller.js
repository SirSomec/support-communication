var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Controller, Get, Headers, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { loadBackendConfig } from "@support-communication/config";
import { buildHealthEnvelope, buildReadinessEnvelope, checkRuntimeDependencies } from "./health.response.js";
let HealthController = class HealthController {
    config = loadBackendConfig();
    health(requestId) {
        return buildHealthEnvelope(this.config, requestId);
    }
    async ready(requestId) {
        const dependencies = await checkRuntimeDependencies(this.config);
        const envelope = buildReadinessEnvelope(this.config, requestId, dependencies);
        if (envelope.data.status === "unready")
            throw new ServiceUnavailableException(envelope);
        return envelope;
    }
};
__decorate([
    Get("health"),
    ApiOkResponse({ description: "API Gateway liveness envelope" }),
    __param(0, Headers("x-request-id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], HealthController.prototype, "health", null);
__decorate([
    Get("ready"),
    ApiOkResponse({ description: "API Gateway readiness envelope" }),
    __param(0, Headers("x-request-id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "ready", null);
HealthController = __decorate([
    ApiTags("platform"),
    Controller()
], HealthController);
export { HealthController };
//# sourceMappingURL=health.controller.js.map