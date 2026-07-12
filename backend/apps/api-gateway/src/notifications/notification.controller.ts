import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { resolveNotificationRequestContext } from "./notification.context.js";
import { NotificationService } from "./notification.service.js";

@ApiTags("notifications")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("notifications")
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @RequireTenantOperatorPermission("notifications.read")
  @RequireServiceAdminAction("notifications.read")
  @ApiOkResponse({ description: "Tenant notification inbox envelope" })
  fetchNotifications(
    @Query() query: { unreadOnly?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.notificationService.fetchNotifications(
      { unreadOnly: query.unreadOnly === "true" },
      resolveNotificationRequestContext(request)
    );
  }

  @Post("mark-read")
  @RequireTenantOperatorPermission("notifications.read")
  @RequireServiceAdminAction("notifications.read")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Mark notifications as read envelope" })
  markNotificationsRead(
    @Body() payload: { all?: boolean; notificationIds?: string[] },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.notificationService.markNotificationsRead(payload, resolveNotificationRequestContext(request));
  }

  @Get("preferences")
  @RequireTenantOperatorPermission("notifications.read")
  @RequireServiceAdminAction("notifications.read")
  @ApiOkResponse({ description: "Tenant notification delivery preferences envelope" })
  fetchNotificationPreferences(@Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.notificationService.fetchNotificationPreferences(resolveNotificationRequestContext(request));
  }

  @Get("push-subscriptions/public-key")
  @RequireTenantOperatorPermission("notifications.read")
  @RequireServiceAdminAction("notifications.read")
  @ApiOkResponse({ description: "Browser push VAPID public key envelope" })
  fetchBrowserPushPublicKey(@Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.notificationService.fetchBrowserPushPublicKey(resolveNotificationRequestContext(request));
  }

  @Post("push-subscriptions")
  @RequireTenantOperatorPermission("notifications.read")
  @RequireServiceAdminAction("notifications.read")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Store browser push subscription envelope" })
  createBrowserPushSubscription(
    @Body() payload: {
      endpoint?: string;
      expirationTime?: number | null;
      keys?: { auth?: string; p256dh?: string };
      userAgent?: string | null;
    },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.notificationService.createBrowserPushSubscription(payload, resolveNotificationRequestContext(request));
  }

  @Delete("push-subscriptions/:subscriptionId")
  @RequireTenantOperatorPermission("notifications.read")
  @RequireServiceAdminAction("notifications.read")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Revoke browser push subscription envelope" })
  deleteBrowserPushSubscription(
    @Param("subscriptionId") subscriptionId: string,
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.notificationService.deleteBrowserPushSubscription(subscriptionId, resolveNotificationRequestContext(request));
  }

  @Post("test-critical-alert")
  @RequireTenantOperatorPermission("notifications.read")
  @RequireServiceAdminAction("notifications.read")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Critical alert delivery test envelope" })
  sendCriticalAlertTest(
    @Body() payload: { channelIds?: string[]; includeBrowserPush?: boolean; message?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.notificationService.sendCriticalAlertTest(payload, resolveNotificationRequestContext(request));
  }

  @Patch("preferences")
  @RequireTenantOperatorPermission("notifications.read")
  @RequireServiceAdminAction("notifications.read")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Update tenant notification delivery preferences envelope" })
  updateNotificationPreferences(
    @Body() payload: {
      browserPushEnabled?: boolean;
      browserPushEndpoint?: string | null;
      browserPushPermission?: string | null;
      browserPushSubscriptionId?: string | null;
      enabledExternalChannelIds?: string[];
      mutedSoundRuleIds?: string[];
      mutedTypeKeys?: string[];
    },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.notificationService.updateNotificationPreferences(payload, resolveNotificationRequestContext(request));
  }
}
