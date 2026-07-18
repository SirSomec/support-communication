import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { SettingsEmployeeService } from "./settings-employee.service.js";
import { SettingsRulesService } from "./settings-rules.service.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "./service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "./tenant-operator-auth.js";

type SettingsRequest = TenantOperatorRequest & ServiceAdminRequest;

@ApiTags("settings")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("settings")
export class SettingsController {
  constructor(
    private readonly settingsEmployeeService: SettingsEmployeeService,
    private readonly settingsRulesService: SettingsRulesService
  ) {}

  @Get("employees")
  @RequireTenantOperatorPermission("settings.read")
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchSettingsEmployees", summary: "List tenant employees with settings permissions" })
  @ApiOkResponse({ description: "Tenant employee settings envelope" })
  fetchEmployees(@Query() query: { groupId?: string; query?: string; roleKey?: string; status?: string; tenantId?: string }, @Req() request: SettingsRequest) {
    return this.settingsEmployeeService.fetchEmployees({
      ...query,
      tenantId: tenantIdFromRequest(request)
    });
  }

  @Post("employees/invites")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "inviteSettingsEmployee", summary: "Invite tenant employee" })
  @ApiOkResponse({ description: "Invited employee envelope" })
  inviteEmployee(@Body() payload: { email?: string; groupId?: string; name?: string; roleKey?: string; tenantId?: string }, @Req() request: SettingsRequest) {
    return this.settingsEmployeeService.inviteEmployee({
      ...payload,
      tenantId: tenantIdFromRequest(request)
    });
  }

  @Patch("employees/:employeeId")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @ApiOperation({ operationId: "updateSettingsEmployee", summary: "Update employee role, group, channels and limits" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "Updated employee envelope" })
  updateEmployee(@Param("employeeId") employeeId: string, @Body() payload: Record<string, unknown>, @Req() request: SettingsRequest) {
    return this.settingsEmployeeService.updateEmployee(employeeId, payload, { tenantId: tenantIdFromRequest(request) });
  }

  @Post("employees/:employeeId/password-reset")
  @RequireTenantOperatorPermission("employees.passwordReset")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "resetSettingsEmployeePassword", summary: "Send password reset for employee" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "Password reset envelope" })
  resetEmployeePassword(@Param("employeeId") employeeId: string, @Req() request: SettingsRequest, @Body() payload: { reason?: string } = {}) {
    return this.settingsEmployeeService.resetEmployeePassword(employeeId, payload, { tenantId: tenantIdFromRequest(request) });
  }

  @Post("employees/:employeeId/mfa-reset")
  @RequireTenantOperatorPermission("employees.passwordReset")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "resetSettingsEmployeeMfa", summary: "Reset employee MFA state" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "MFA reset envelope" })
  resetEmployeeMfa(@Param("employeeId") employeeId: string, @Req() request: SettingsRequest, @Body() payload: { reason?: string } = {}) {
    return this.settingsEmployeeService.resetEmployeeMfa(employeeId, payload, { tenantId: tenantIdFromRequest(request) });
  }

  @Post("employees/:employeeId/deactivate")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "deactivateSettingsEmployee", summary: "Deactivate tenant employee" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "Employee deactivation envelope" })
  deactivateEmployee(@Param("employeeId") employeeId: string, @Req() request: SettingsRequest, @Body() payload: { reason?: string } = {}) {
    return this.settingsEmployeeService.deactivateEmployee(employeeId, payload, { tenantId: tenantIdFromRequest(request) });
  }

  @Delete("employees/:employeeId")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "deleteSettingsEmployee", summary: "Delete tenant employee account" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "Employee deletion envelope" })
  deleteEmployee(@Param("employeeId") employeeId: string, @Req() request: SettingsRequest, @Body() payload: { reason?: string } = {}) {
    return this.settingsEmployeeService.deleteEmployee(employeeId, payload, { tenantId: tenantIdFromRequest(request) });
  }

  @Post("employees/:employeeId/invite-resend")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "resendSettingsEmployeeInvite", summary: "Resend employee invite email" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "Invite resend envelope" })
  resendEmployeeInvite(@Param("employeeId") employeeId: string, @Req() request: SettingsRequest, @Body() payload: { reason?: string } = {}) {
    return this.settingsEmployeeService.resendEmployeeInvite(employeeId, payload, { tenantId: tenantIdFromRequest(request) });
  }

  @Get("roles")
  @RequireTenantOperatorPermission("settings.read")
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchSettingsRoles", summary: "List tenant roles available in settings" })
  @ApiOkResponse({ description: "Role read model envelope" })
  fetchRoles() {
    return this.settingsEmployeeService.fetchRoles();
  }

  @Get("groups")
  @RequireTenantOperatorPermission("settings.read")
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchSettingsGroups", summary: "List tenant employee groups" })
  @ApiOkResponse({ description: "Employee groups envelope" })
  fetchGroups(@Query() query: { tenantId?: string }, @Req() request: SettingsRequest) {
    return this.settingsEmployeeService.fetchGroups({ tenantId: tenantIdFromRequest(request) });
  }

  @Post("groups")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createSettingsGroup", summary: "Create tenant employee group" })
  @ApiOkResponse({ description: "Created employee group envelope" })
  createGroup(@Body() payload: { channels?: string[]; memberIds?: string[]; name?: string; scope?: string }, @Req() request: SettingsRequest) {
    return this.settingsEmployeeService.createGroup(payload, { tenantId: tenantIdFromRequest(request) });
  }

  @Patch("groups/:groupId")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @ApiOperation({ operationId: "updateSettingsGroup", summary: "Update tenant employee group" })
  @ApiParam({ name: "groupId", description: "Group identifier" })
  @ApiOkResponse({ description: "Updated employee group envelope" })
  updateGroup(@Param("groupId") groupId: string, @Body() payload: { channels?: string[]; memberIds?: string[]; name?: string; scope?: string }, @Req() request: SettingsRequest) {
    return this.settingsEmployeeService.updateGroup(groupId, payload, { tenantId: tenantIdFromRequest(request) });
  }

  @Delete("groups/:groupId")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "deleteSettingsGroup", summary: "Delete tenant employee group" })
  @ApiParam({ name: "groupId", description: "Group identifier" })
  @ApiOkResponse({ description: "Employee group deletion envelope" })
  deleteGroup(@Param("groupId") groupId: string, @Req() request: SettingsRequest, @Body() payload: { reason?: string } = {}) {
    return this.settingsEmployeeService.deleteGroup(groupId, payload, { tenantId: tenantIdFromRequest(request) });
  }

  @Get("rules")
  @RequireTenantOperatorPermission("settings.read")
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchSettingsRules", summary: "List tenant business rules used by dialogs, routing and audit" })
  @ApiOkResponse({ description: "Settings rules workspace envelope" })
  fetchRules(@Query() query: { tenantId?: string }, @Req() request: SettingsRequest) {
    return this.settingsRulesService.fetchRules({
      ...query,
      tenantId: tenantIdFromRequest(request)
    });
  }

  @Patch("rules/:ruleId")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @ApiOperation({ operationId: "updateSettingsRule", summary: "Update settings rule state and parameters" })
  @ApiParam({ name: "ruleId", description: "Settings rule identifier" })
  @ApiOkResponse({ description: "Updated settings rule envelope" })
  updateRule(@Param("ruleId") ruleId: string, @Body() payload: Record<string, unknown>, @Req() request: SettingsRequest) {
    return this.settingsRulesService.updateRule(ruleId, payload, { tenantId: tenantIdFromRequest(request) });
  }

  @Post("rules/:ruleId/test")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "testSettingsRule", summary: "Run a settings rule impact test" })
  @ApiParam({ name: "ruleId", description: "Settings rule identifier" })
  @ApiOkResponse({ description: "Settings rule test envelope" })
  testRule(@Param("ruleId") ruleId: string, @Req() request: SettingsRequest, @Body() payload: { sampleSize?: number } = {}) {
    return this.settingsRulesService.testRule(ruleId, payload, { tenantId: tenantIdFromRequest(request) });
  }
}

function tenantIdFromRequest(request: SettingsRequest): string | undefined {
  return request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId;
}
