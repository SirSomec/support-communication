import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "./demo-service-admin.guard.js";
import { SettingsEmployeeService } from "./settings-employee.service.js";
import { SettingsRulesService } from "./settings-rules.service.js";
import { RequireServiceAdminAction } from "./service-admin-auth.js";

@ApiTags("settings")
@UseGuards(DemoServiceAdminGuard)
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
  fetchEmployees(@Query() query: { groupId?: string; query?: string; roleKey?: string; status?: string; tenantId?: string }) {
    return this.settingsEmployeeService.fetchEmployees(query);
  }

  @Post("employees/invites")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "inviteSettingsEmployee", summary: "Invite tenant employee" })
  @ApiOkResponse({ description: "Invited employee envelope" })
  inviteEmployee(@Body() payload: { email?: string; groupId?: string; name?: string; roleKey?: string; tenantId?: string }) {
    return this.settingsEmployeeService.inviteEmployee(payload);
  }

  @Patch("employees/:employeeId")
  @RequireServiceAdminAction("settings.manage")
  @ApiOperation({ operationId: "updateSettingsEmployee", summary: "Update employee role, group, channels and limits" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "Updated employee envelope" })
  updateEmployee(@Param("employeeId") employeeId: string, @Body() payload: Record<string, unknown>) {
    return this.settingsEmployeeService.updateEmployee(employeeId, payload);
  }

  @Post("employees/:employeeId/password-reset")
  @RequireServiceAdminAction("settings.security.reset")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "resetSettingsEmployeePassword", summary: "Send password reset for employee" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "Password reset envelope" })
  resetEmployeePassword(@Param("employeeId") employeeId: string, @Body() payload: { reason?: string } = {}) {
    return this.settingsEmployeeService.resetEmployeePassword(employeeId, payload);
  }

  @Post("employees/:employeeId/mfa-reset")
  @RequireServiceAdminAction("settings.security.reset")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "resetSettingsEmployeeMfa", summary: "Reset employee MFA state" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "MFA reset envelope" })
  resetEmployeeMfa(@Param("employeeId") employeeId: string, @Body() payload: { reason?: string } = {}) {
    return this.settingsEmployeeService.resetEmployeeMfa(employeeId, payload);
  }

  @Post("employees/:employeeId/deactivate")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "deactivateSettingsEmployee", summary: "Deactivate tenant employee" })
  @ApiParam({ name: "employeeId", description: "Employee identifier" })
  @ApiOkResponse({ description: "Employee deactivation envelope" })
  deactivateEmployee(@Param("employeeId") employeeId: string, @Body() payload: { reason?: string } = {}) {
    return this.settingsEmployeeService.deactivateEmployee(employeeId, payload);
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
  fetchGroups() {
    return this.settingsEmployeeService.fetchGroups();
  }

  @Post("groups")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createSettingsGroup", summary: "Create tenant employee group" })
  @ApiOkResponse({ description: "Created employee group envelope" })
  createGroup(@Body() payload: { channels?: string[]; memberIds?: string[]; name?: string; scope?: string }) {
    return this.settingsEmployeeService.createGroup(payload);
  }

  @Patch("groups/:groupId")
  @RequireServiceAdminAction("settings.manage")
  @ApiOperation({ operationId: "updateSettingsGroup", summary: "Update tenant employee group" })
  @ApiParam({ name: "groupId", description: "Group identifier" })
  @ApiOkResponse({ description: "Updated employee group envelope" })
  updateGroup(@Param("groupId") groupId: string, @Body() payload: { channels?: string[]; memberIds?: string[]; name?: string; scope?: string }) {
    return this.settingsEmployeeService.updateGroup(groupId, payload);
  }

  @Get("rules")
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchSettingsRules", summary: "List tenant business rules used by dialogs, routing and audit" })
  @ApiOkResponse({ description: "Settings rules workspace envelope" })
  fetchRules(@Query() query: { tenantId?: string }) {
    return this.settingsRulesService.fetchRules(query);
  }

  @Patch("rules/:ruleId")
  @RequireServiceAdminAction("settings.manage")
  @ApiOperation({ operationId: "updateSettingsRule", summary: "Update settings rule state and parameters" })
  @ApiParam({ name: "ruleId", description: "Settings rule identifier" })
  @ApiOkResponse({ description: "Updated settings rule envelope" })
  updateRule(@Param("ruleId") ruleId: string, @Body() payload: Record<string, unknown>) {
    return this.settingsRulesService.updateRule(ruleId, payload);
  }

  @Post("rules/:ruleId/test")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "testSettingsRule", summary: "Run a settings rule impact test" })
  @ApiParam({ name: "ruleId", description: "Settings rule identifier" })
  @ApiOkResponse({ description: "Settings rule test envelope" })
  testRule(@Param("ruleId") ruleId: string, @Body() payload: { sampleSize?: number } = {}) {
    return this.settingsRulesService.testRule(ruleId, payload);
  }
}
