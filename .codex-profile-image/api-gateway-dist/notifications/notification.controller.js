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
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { resolveNotificationRequestContext } from "./notification.context.js";
import { NotificationService } from "./notification.service.js";
let NotificationController = class NotificationController {
    notificationService;
    constructor(notificationService) {
        this.notificationService = notificationService;
    }
    fetchNotifications(query, request) {
        return this.notificationService.fetchNotifications({ unreadOnly: query.unreadOnly === "true" }, resolveNotificationRequestContext(request));
    }
    markNotificationsRead(payload, request) {
        return this.notificationService.markNotificationsRead(payload, resolveNotificationRequestContext(request));
    }
    fetchNotificationPreferences(request) {
        return this.notificationService.fetchNotificationPreferences(resolveNotificationRequestContext(request));
    }
    fetchBrowserPushPublicKey(request) {
        return this.notificationService.fetchBrowserPushPublicKey(resolveNotificationRequestContext(request));
    }
    createBrowserPushSubscription(payload, request) {
        return this.notificationService.createBrowserPushSubscription(payload, resolveNotificationRequestContext(request));
    }
    deleteBrowserPushSubscription(subscriptionId, request) {
        return this.notificationService.deleteBrowserPushSubscription(subscriptionId, resolveNotificationRequestContext(request));
    }
    sendCriticalAlertTest(payload, request) {
        return this.notificationService.sendCriticalAlertTest(payload, resolveNotificationRequestContext(request));
    }
    updateNotificationPreferences(payload, request) {
        return this.notificationService.updateNotificationPreferences(payload, resolveNotificationRequestContext(request));
    }
};
__decorate([
    Get(),
    RequireTenantOperatorPermission("notifications.read"),
    RequireServiceAdminAction("notifications.read"),
    ApiOkResponse({ description: "Tenant notification inbox envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "fetchNotifications", null);
__decorate([
    Post("mark-read"),
    RequireTenantOperatorPermission("notifications.read"),
    RequireServiceAdminAction("notifications.read"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Mark notifications as read envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "markNotificationsRead", null);
__decorate([
    Get("preferences"),
    RequireTenantOperatorPermission("notifications.read"),
    RequireServiceAdminAction("notifications.read"),
    ApiOkResponse({ description: "Tenant notification delivery preferences envelope" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "fetchNotificationPreferences", null);
__decorate([
    Get("push-subscriptions/public-key"),
    RequireTenantOperatorPermission("notifications.read"),
    RequireServiceAdminAction("notifications.read"),
    ApiOkResponse({ description: "Browser push VAPID public key envelope" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "fetchBrowserPushPublicKey", null);
__decorate([
    Post("push-subscriptions"),
    RequireTenantOperatorPermission("notifications.read"),
    RequireServiceAdminAction("notifications.read"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Store browser push subscription envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "createBrowserPushSubscription", null);
__decorate([
    Delete("push-subscriptions/:subscriptionId"),
    RequireTenantOperatorPermission("notifications.read"),
    RequireServiceAdminAction("notifications.read"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Revoke browser push subscription envelope" }),
    __param(0, Param("subscriptionId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "deleteBrowserPushSubscription", null);
__decorate([
    Post("test-critical-alert"),
    RequireTenantOperatorPermission("notifications.read"),
    RequireServiceAdminAction("notifications.read"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Critical alert delivery test envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "sendCriticalAlertTest", null);
__decorate([
    Patch("preferences"),
    RequireTenantOperatorPermission("notifications.read"),
    RequireServiceAdminAction("notifications.read"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Update tenant notification delivery preferences envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "updateNotificationPreferences", null);
NotificationController = __decorate([
    ApiTags("notifications"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("notifications"),
    __metadata("design:paramtypes", [NotificationService])
], NotificationController);
export { NotificationController };
//# sourceMappingURL=notification.controller.js.map