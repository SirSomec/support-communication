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
import { Controller, Get, Headers, Query, Req, Sse, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { ConversationService } from "./conversation.service.js";
import { createRealtimeSseStream } from "./realtime.sse.js";
import { TenantOperatorOrServiceAdminGuard } from "./tenant-operator-or-service-admin.guard.js";
let RealtimeController = class RealtimeController {
    conversationService;
    constructor(conversationService) {
        this.conversationService = conversationService;
    }
    fetchRealtimeEvents(filters, request) {
        return this.conversationService.fetchRealtimeEvents(filters, {
            tenantId: request.tenantOperatorContext?.tenantId
        });
    }
    streamRealtimeEvents(filters, lastEventId, request) {
        return createRealtimeSseStream(this.conversationService, {
            ...filters,
            ...(request?.tenantOperatorContext?.tenantId
                ? { tenantId: request.tenantOperatorContext.tenantId }
                : {})
        }, lastEventId, {
            keepOpen: true,
            includeHandshake: true
        });
    }
};
__decorate([
    Get("events"),
    RequireTenantOperatorPermission("realtime.events.read"),
    RequireServiceAdminAction("realtime.events.read"),
    ApiOkResponse({ description: "Realtime event feed envelope for smoke and adapter compatibility" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RealtimeController.prototype, "fetchRealtimeEvents", null);
__decorate([
    Sse("events/stream"),
    RequireTenantOperatorPermission("realtime.events.read"),
    RequireServiceAdminAction("realtime.events.read"),
    ApiOkResponse({ description: "Server-Sent Events stream for persisted realtime events" }),
    __param(0, Query()),
    __param(1, Headers("last-event-id")),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Function)
], RealtimeController.prototype, "streamRealtimeEvents", null);
RealtimeController = __decorate([
    ApiTags("realtime"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("realtime"),
    __metadata("design:paramtypes", [ConversationService])
], RealtimeController);
export { RealtimeController };
//# sourceMappingURL=realtime.controller.js.map