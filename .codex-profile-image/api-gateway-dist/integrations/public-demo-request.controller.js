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
import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PublicDemoRequestService } from "./public-demo-request.service.js";
let PublicDemoRequestController = class PublicDemoRequestController {
    publicDemoRequestService;
    constructor(publicDemoRequestService) {
        this.publicDemoRequestService = publicDemoRequestService;
    }
    createDemoRequest(payload = {}, idempotencyKey, userAgent, request) {
        return this.publicDemoRequestService.createDemoRequest(payload, {
            idempotencyKey,
            ip: requestIp(request),
            userAgent
        });
    }
};
__decorate([
    Post(),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        description: "Accepts unauthenticated public landing demo/contact requests and queues a lead notification descriptor.",
        operationId: "createPublicDemoRequest",
        summary: "Create a public demo request"
    }),
    ApiOkResponse({ description: "Public demo request envelope with sanitized lead id, audit event and notification descriptor" }),
    __param(0, Body()),
    __param(1, Headers("idempotency-key")),
    __param(2, Headers("user-agent")),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], PublicDemoRequestController.prototype, "createDemoRequest", null);
PublicDemoRequestController = __decorate([
    ApiTags("public"),
    Controller("public/demo-requests"),
    __metadata("design:paramtypes", [PublicDemoRequestService])
], PublicDemoRequestController);
export { PublicDemoRequestController };
function requestIp(request) {
    const forwarded = firstHeaderValue(request.headers?.["x-forwarded-for"]);
    if (forwarded) {
        return forwarded.split(",")[0]?.trim();
    }
    return request.ip ?? request.socket?.remoteAddress;
}
function firstHeaderValue(value) {
    return Array.isArray(value) ? value[0] : value;
}
//# sourceMappingURL=public-demo-request.controller.js.map