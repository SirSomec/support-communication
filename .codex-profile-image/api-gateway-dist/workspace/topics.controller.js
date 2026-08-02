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
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { TopicDirectoryService } from "./topic-directory.service.js";
let TopicsController = class TopicsController {
    topicDirectoryService;
    constructor(topicDirectoryService) {
        this.topicDirectoryService = topicDirectoryService;
    }
    fetchTopics(query, request) {
        return this.topicDirectoryService.fetchTopics(query, topicTenantScope(request));
    }
    createTopic(payload, request) {
        return this.topicDirectoryService.createTopic(payload, topicTenantScope(request));
    }
    updateTopic(topicId, payload, request) {
        return this.topicDirectoryService.updateTopic(topicId, payload, topicTenantScope(request));
    }
    archiveTopic(topicId, payload = {}, request) {
        return this.topicDirectoryService.archiveTopic(topicId, payload, topicTenantScope(request));
    }
    restoreTopic(topicId, payload = {}, request) {
        return this.topicDirectoryService.restoreTopic(topicId, payload, topicTenantScope(request));
    }
    fetchTopicUsage(topicId, request) {
        return this.topicDirectoryService.fetchTopicUsage(topicId, topicTenantScope(request));
    }
};
__decorate([
    Get(),
    RequireTenantOperatorPermission("settings.read"),
    RequireServiceAdminAction("settings.read"),
    ApiOperation({ operationId: "fetchWorkspaceTopics", summary: "List tenant topic directory" }),
    ApiOkResponse({ description: "Topic directory envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TopicsController.prototype, "fetchTopics", null);
__decorate([
    Post(),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "createWorkspaceTopic", summary: "Create topic directory entry" }),
    ApiOkResponse({ description: "Created topic envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TopicsController.prototype, "createTopic", null);
__decorate([
    Patch(":topicId"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    ApiOperation({ operationId: "updateWorkspaceTopic", summary: "Update topic directory entry" }),
    ApiParam({ name: "topicId", description: "Topic identifier" }),
    ApiOkResponse({ description: "Updated topic envelope" }),
    __param(0, Param("topicId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TopicsController.prototype, "updateTopic", null);
__decorate([
    Post(":topicId/archive"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "archiveWorkspaceTopic", summary: "Archive topic directory entry" }),
    ApiParam({ name: "topicId", description: "Topic identifier" }),
    ApiOkResponse({ description: "Archived topic envelope" }),
    __param(0, Param("topicId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TopicsController.prototype, "archiveTopic", null);
__decorate([
    Post(":topicId/restore"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "restoreWorkspaceTopic", summary: "Restore archived topic directory entry" }),
    ApiParam({ name: "topicId", description: "Topic identifier" }),
    ApiOkResponse({ description: "Restored topic envelope" }),
    __param(0, Param("topicId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TopicsController.prototype, "restoreTopic", null);
__decorate([
    Get(":topicId/usage"),
    RequireTenantOperatorPermission("settings.read"),
    RequireServiceAdminAction("settings.read"),
    ApiOperation({ operationId: "fetchWorkspaceTopicUsage", summary: "Read topic usage before archive or restore" }),
    ApiParam({ name: "topicId", description: "Topic identifier" }),
    ApiOkResponse({ description: "Topic usage envelope" }),
    __param(0, Param("topicId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TopicsController.prototype, "fetchTopicUsage", null);
TopicsController = __decorate([
    ApiTags("workspace"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("workspace/topics"),
    __metadata("design:paramtypes", [TopicDirectoryService])
], TopicsController);
export { TopicsController };
function topicTenantScope(request) {
    const tenantId = request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId;
    if (!tenantId) {
        throw new Error("topic_tenant_id_required");
    }
    return { tenantId };
}
//# sourceMappingURL=topics.controller.js.map