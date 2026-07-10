import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { ServiceAdminSessionGuard } from "./service-admin-session.guard.js";
import { SettingsEmployeeService } from "./settings-employee.service.js";
import { SettingsRulesService } from "./settings-rules.service.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "./service-admin-auth.js";

@ApiTags("settings")
@UseGuards(ServiceAdminSessionGuard)
@Controller("settings")
export class SettingsController {
  constructor(
    private readonly settingsEmployeeService: SettingsEmployeeService,
    private readonly settingsRulesService: SettingsRulesService
  ) {}

  @Get("employees")
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchSettingsEmployees", summary: "List tenant employees with settings permissions" })
  @ApiOkResponse({ description: "Tenant employee settings envelope" })
  fetchEmployees(@Query() query: { groupId?: string; query?: string; roleKey?: string; status?: string; tenantId?: string }, @Req() request: ServiceAdminRequest) {
    return this.settingsEmployeeService.fetchEmployees({
      ...query,
      tenantId: request.serviceAdminContext?.currentTenantId ?? query.tenantId
    });
  }

  @Post("employees/invites")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "inviteSettingsEmployee", summary: "Invite tenant employee" })
  @ApiOkResponse({ description: "Invited employee envelope" })
  inviteEmployee(@Body() payload: { email?: string; groupId?: string; name?: string; roleKey?: string; tenantId?: string }, @Req() request: ServiceAdminRequest) {
    return this.settingsEmployeeService.inviteEmployee({
      ...payload,
      tenantId: request.serviceAdminContext?.currentTenantId ?? payload.tenantId
    });
  }

  @Patch("employees/:employeeId")
  @RequireServiceAdminAction("settings.manage")
  @ApiOperation({ operationId: "updateSettingsEmployee", summary: "Update employee role, group, channels and limits" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "Updated employee envelope" })
  updateEmployee(@Param("employeeId") employeeId: string, @Body() payload: Record<string, unknown>, @Req() request: ServiceAdminRequest) {
    return this.settingsEmployeeService.updateEmployee(employeeId, payload, { tenantId: request.serviceAdminContext?.currentTenantId });
  }

  @Post("employees/:employeeId/password-reset")
  @RequireServiceAdminAction("settings.security.reset")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "resetSettingsEmployeePassword", summary: "Send password reset for employee" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "Password reset envelope" })
  resetEmployeePassword(@Param("employeeId") employeeId: string, @Req() request: ServiceAdminRequest, @Body() payload: { reason?: string } = {}) {
    return this.settingsEmployeeService.resetEmployeePassword(employeeId, payload, { tenantId: request.serviceAdminContext?.currentTenantId });
  }

  @Post("employees/:employeeId/mfa-reset")
  @RequireServiceAdminAction("settings.security.reset")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "resetSettingsEmployeeMfa", summary: "Reset employee MFA state" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "MFA reset envelope" })
  resetEmployeeMfa(@Param("employeeId") employeeId: string, @Req() request: ServiceAdminRequest, @Body() payload: { reason?: string } = {}) {
    return this.settingsEmployeeService.resetEmployeeMfa(employeeId, payload, { tenantId: request.serviceAdminContext?.currentTenantId });
  }

  @Post("employees/:employeeId/deactivate")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "deactivateSettingsEmployee", summary: "Deactivate tenant employee" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "Employee deactivation envelope" })
  deactivateEmployee(@Param("employeeId") employeeId: string, @Req() request: ServiceAdminRequest, @Body() payload: { reason?: string } = {}) {
    return this.settingsEmployeeService.deactivateEmployee(employeeId, payload, { tenantId: request.serviceAdminContext?.currentTenantId });
  }

  @Get("roles")
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchSettingsRoles", summary: "List tenant roles available in settings" })
  @ApiOkResponse({ description: "Role read model envelope" })
  fetchRoles() {
    return this.settingsEmployeeService.fetchRoles();
  }

  @Get("groups")
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchSettingsGroups", summary: "List tenant employee groups" })
  @ApiOkResponse({ description: "Employee groups envelope" })
  fetchGroups(@Query() query: { tenantId?: string }, @Req() request: ServiceAdminRequest) {
    return this.settingsEmployeeService.fetchGroups({ tenantId: request.serviceAdminContext?.currentTenantId ?? query.tenantId });
  }

  @Post("groups")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createSettingsGroup", summary: "Create tenant employee group" })
  @ApiOkResponse({ description: "Created employee group envelope" })
  createGroup(@Body() payload: { channels?: string[]; memberIds?: string[]; name?: string; scope?: string }, @Req() request: ServiceAdminRequest) {
    return this.settingsEmployeeService.createGroup(payload, { tenantId: request.serviceAdminContext?.currentTenantId });
  }

  @Patch("groups/:groupId")
  @RequireServiceAdminAction("settings.manage")
  @ApiOperation({ operationId: "updateSettingsGroup", summary: "Update tenant employee group" })
  @ApiParam({ name: "groupId", description: "Group identifier" })
  @ApiOkResponse({ description: "Updated employee group envelope" })
  updateGroup(@Param("groupId") groupId: string, @Body() payload: { channels?: string[]; memberIds?: string[]; name?: string; scope?: string }, @Req() request: ServiceAdminRequest) {
    return this.settingsEmployeeService.updateGroup(groupId, payload, { tenantId: request.serviceAdminContext?.currentTenantId });
  }

  @Get("rules")
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchSettingsRules", summary: "List tenant business rules used by dialogs, routing and audit" })
  @ApiOkResponse({ description: "Settings rules workspace envelope" })
  fetchRules(@Query() query: { tenantId?: string }, @Req() request: ServiceAdminRequest) {
    return this.settingsRulesService.fetchRules({
      ...query,
      tenantId: request.serviceAdminContext?.currentTenantId ?? query.tenantId
    });
  }

  @Patch("rules/:ruleId")
  @RequireServiceAdminAction("settings.manage")
  @ApiOperation({ operationId: "updateSettingsRule", summary: "Update settings rule state and parameters" })
  @ApiParam({ name: "ruleId", description: "Settings rule identifier" })
  @ApiOkResponse({ description: "Updated settings rule envelope" })
  updateRule(@Param("ruleId") ruleId: string, @Body() payload: Record<string, unknown>, @Req() request: ServiceAdminRequest) {
    return this.settingsRulesService.updateRule(ruleId, payload, { tenantId: request.serviceAdminContext?.currentTenantId });
  }

  @Post("rules/:ruleId/test")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "testSettingsRule", summary: "Run a settings rule impact test" })
  @ApiParam({ name: "ruleId", description: "Settings rule identifier" })
  @ApiOkResponse({ description: "Settings rule test envelope" })
  testRule(@Param("ruleId") ruleId: string, @Req() request: ServiceAdminRequest, @Body() payload: { sampleSize?: number } = {}) {
    return this.settingsRulesService.testRule(ruleId, payload, { tenantId: request.serviceAdminContext?.currentTenantId });
  }
}
