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
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { ConversationService } from "./conversation.service.js";
let ChannelController = class ChannelController {
    conversationService;
    constructor(conversationService) {
        this.conversationService = conversationService;
    }
    fetchChannels() {
        return this.conversationService.fetchChannels();
    }
    normalizeInboundEvent(channel, payload) {
        return this.conversationService.normalizeInboundEvent(channel, payload);
    }
    recordDeliveryReceipt(channel, payload) {
        return this.conversationService.recordDeliveryReceipt(channel, payload, {
            tenantId: payload.tenantId
        });
    }
};
__decorate([
    Get(),
    RequireServiceAdminAction("channels.read"),
    ApiOkResponse({ description: "Channel connector readiness envelope" }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ChannelController.prototype, "fetchChannels", null);
__decorate([
    Post(":channel/inbound"),
    RequireServiceAdminAction("channels.ingest"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Idempotent inbound channel event normalization envelope" }),
    __param(0, Param("channel")),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChannelController.prototype, "normalizeInboundEvent", null);
__decorate([
    Post(":channel/delivery-receipts"),
    RequireServiceAdminAction("channels.ingest"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Provider delivery receipt ingestion envelope" }),
    __param(0, Param("channel")),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChannelController.prototype, "recordDeliveryReceipt", null);
ChannelController = __decorate([
    ApiTags("channels"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("channels"),
    __metadata("design:paramtypes", [ConversationService])
], ChannelController);
export { ChannelController };
//# sourceMappingURL=channel.controller.js.map