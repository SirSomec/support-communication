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
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { SettingsEmployeeService } from "./settings-employee.service.js";
import { SettingsRulesService } from "./settings-rules.service.js";
import { RequireServiceAdminAction } from "./service-admin-auth.js";
import { RequireTenantOperatorPermission } from "./tenant-operator-auth.js";
let SettingsController = class SettingsController {
    settingsEmployeeService;
    settingsRulesService;
    constructor(settingsEmployeeService, settingsRulesService) {
        this.settingsEmployeeService = settingsEmployeeService;
        this.settingsRulesService = settingsRulesService;
    }
    fetchEmployees(query, request) {
        return this.settingsEmployeeService.fetchEmployees({
            ...query,
            tenantId: tenantIdFromRequest(request)
        });
    }
    inviteEmployee(payload, request) {
        return this.settingsEmployeeService.inviteEmployee({
            ...payload,
            tenantId: tenantIdFromRequest(request)
        });
    }
    updateEmployee(employeeId, payload, request) {
        return this.settingsEmployeeService.updateEmployee(employeeId, payload, { tenantId: tenantIdFromRequest(request) });
    }
    resetEmployeePassword(employeeId, request, payload = {}) {
        return this.settingsEmployeeService.resetEmployeePassword(employeeId, payload, { tenantId: tenantIdFromRequest(request) });
    }
    resetEmployeeMfa(employeeId, request, payload = {}) {
        return this.settingsEmployeeService.resetEmployeeMfa(employeeId, payload, { tenantId: tenantIdFromRequest(request) });
    }
    deactivateEmployee(employeeId, request, payload = {}) {
        return this.settingsEmployeeService.deactivateEmployee(employeeId, payload, { tenantId: tenantIdFromRequest(request) });
    }
    deleteEmployee(employeeId, request, payload = {}) {
        return this.settingsEmployeeService.deleteEmployee(employeeId, payload, { tenantId: tenantIdFromRequest(request) });
    }
    resendEmployeeInvite(employeeId, request, payload = {}) {
        return this.settingsEmployeeService.resendEmployeeInvite(employeeId, payload, { tenantId: tenantIdFromRequest(request) });
    }
    fetchRoles() {
        return this.settingsEmployeeService.fetchRoles();
    }
    fetchGroups(query, request) {
        return this.settingsEmployeeService.fetchGroups({ tenantId: tenantIdFromRequest(request) });
    }
    createGroup(payload, request) {
        return this.settingsEmployeeService.createGroup(payload, { tenantId: tenantIdFromRequest(request) });
    }
    updateGroup(groupId, payload, request) {
        return this.settingsEmployeeService.updateGroup(groupId, payload, { tenantId: tenantIdFromRequest(request) });
    }
    deleteGroup(groupId, request, payload = {}) {
        return this.settingsEmployeeService.deleteGroup(groupId, payload, { tenantId: tenantIdFromRequest(request) });
    }
    fetchRules(query, request) {
        return this.settingsRulesService.fetchRules({
            ...query,
            tenantId: tenantIdFromRequest(request)
        });
    }
    updateRule(ruleId, payload, request) {
        return this.settingsRulesService.updateRule(ruleId, payload, { tenantId: tenantIdFromRequest(request) });
    }
    testRule(ruleId, request, payload = {}) {
        return this.settingsRulesService.testRule(ruleId, payload, { tenantId: tenantIdFromRequest(request) });
    }
};
__decorate([
    Get("employees"),
    RequireTenantOperatorPermission("settings.read"),
    RequireServiceAdminAction("settings.read"),
    ApiOperation({ operationId: "fetchSettingsEmployees", summary: "List tenant employees with settings permissions" }),
    ApiOkResponse({ description: "Tenant employee settings envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "fetchEmployees", null);
__decorate([
    Post("employees/invites"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "inviteSettingsEmployee", summary: "Invite tenant employee" }),
    ApiOkResponse({ description: "Invited employee envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "inviteEmployee", null);
__decorate([
    Patch("employees/:employeeId"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    ApiOperation({ operationId: "updateSettingsEmployee", summary: "Update employee role, group, channels and limits" }),
    ApiParam({ name: "employeeId", description: "Employee identifier" }),
    ApiOkResponse({ description: "Updated employee envelope" }),
    __param(0, Param("employeeId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "updateEmployee", null);
__decorate([
    Post("employees/:employeeId/password-reset"),
    RequireTenantOperatorPermission("employees.passwordReset"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "resetSettingsEmployeePassword", summary: "Send password reset for employee" }),
    ApiParam({ name: "employeeId", description: "Employee identifier" }),
    ApiOkResponse({ description: "Password reset envelope" }),
    __param(0, Param("employeeId")),
    __param(1, Req()),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "resetEmployeePassword", null);
__decorate([
    Post("employees/:employeeId/mfa-reset"),
    RequireTenantOperatorPermission("employees.passwordReset"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "resetSettingsEmployeeMfa", summary: "Reset employee MFA state" }),
    ApiParam({ name: "employeeId", description: "Employee identifier" }),
    ApiOkResponse({ description: "MFA reset envelope" }),
    __param(0, Param("employeeId")),
    __param(1, Req()),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "resetEmployeeMfa", null);
__decorate([
    Post("employees/:employeeId/deactivate"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "deactivateSettingsEmployee", summary: "Deactivate tenant employee" }),
    ApiParam({ name: "employeeId", description: "Employee identifier" }),
    ApiOkResponse({ description: "Employee deactivation envelope" }),
    __param(0, Param("employeeId")),
    __param(1, Req()),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "deactivateEmployee", null);
__decorate([
    Delete("employees/:employeeId"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "deleteSettingsEmployee", summary: "Delete tenant employee account" }),
    ApiParam({ name: "employeeId", description: "Employee identifier" }),
    ApiOkResponse({ description: "Employee deletion envelope" }),
    __param(0, Param("employeeId")),
    __param(1, Req()),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "deleteEmployee", null);
__decorate([
    Post("employees/:employeeId/invite-resend"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "resendSettingsEmployeeInvite", summary: "Resend employee invite email" }),
    ApiParam({ name: "employeeId", description: "Employee identifier" }),
    ApiOkResponse({ description: "Invite resend envelope" }),
    __param(0, Param("employeeId")),
    __param(1, Req()),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "resendEmployeeInvite", null);
__decorate([
    Get("roles"),
    RequireTenantOperatorPermission("settings.read"),
    RequireServiceAdminAction("settings.read"),
    ApiOperation({ operationId: "fetchSettingsRoles", summary: "List tenant roles available in settings" }),
    ApiOkResponse({ description: "Role read model envelope" }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "fetchRoles", null);
__decorate([
    Get("groups"),
    RequireTenantOperatorPermission("settings.read"),
    RequireServiceAdminAction("settings.read"),
    ApiOperation({ operationId: "fetchSettingsGroups", summary: "List tenant employee groups" }),
    ApiOkResponse({ description: "Employee groups envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "fetchGroups", null);
__decorate([
    Post("groups"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "createSettingsGroup", summary: "Create tenant employee group" }),
    ApiOkResponse({ description: "Created employee group envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "createGroup", null);
__decorate([
    Patch("groups/:groupId"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    ApiOperation({ operationId: "updateSettingsGroup", summary: "Update tenant employee group" }),
    ApiParam({ name: "groupId", description: "Group identifier" }),
    ApiOkResponse({ description: "Updated employee group envelope" }),
    __param(0, Param("groupId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "updateGroup", null);
__decorate([
    Delete("groups/:groupId"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "deleteSettingsGroup", summary: "Delete tenant employee group" }),
    ApiParam({ name: "groupId", description: "Group identifier" }),
    ApiOkResponse({ description: "Employee group deletion envelope" }),
    __param(0, Param("groupId")),
    __param(1, Req()),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "deleteGroup", null);
__decorate([
    Get("rules"),
    RequireTenantOperatorPermission("settings.read"),
    RequireServiceAdminAction("settings.read"),
    ApiOperation({ operationId: "fetchSettingsRules", summary: "List tenant business rules used by dialogs, routing and audit" }),
    ApiOkResponse({ description: "Settings rules workspace envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "fetchRules", null);
__decorate([
    Patch("rules/:ruleId"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    ApiOperation({ operationId: "updateSettingsRule", summary: "Update settings rule state and parameters" }),
    ApiParam({ name: "ruleId", description: "Settings rule identifier" }),
    ApiOkResponse({ description: "Updated settings rule envelope" }),
    __param(0, Param("ruleId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "updateRule", null);
__decorate([
    Post("rules/:ruleId/test"),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "testSettingsRule", summary: "Run a settings rule impact test" }),
    ApiParam({ name: "ruleId", description: "Settings rule identifier" }),
    ApiOkResponse({ description: "Settings rule test envelope" }),
    __param(0, Param("ruleId")),
    __param(1, Req()),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "testRule", null);
SettingsController = __decorate([
    ApiTags("settings"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("settings"),
    __metadata("design:paramtypes", [SettingsEmployeeService,
        SettingsRulesService])
], SettingsController);
export { SettingsController };
function tenantIdFromRequest(request) {
    return request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId;
}
//# sourceMappingURL=settings.controller.js.map