var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
/** Schema-only DTOs: runtime validation remains in AutomationService so old clients keep working. */
export class BotScenarioTriggerRuleDto {
    type;
    matchMode;
    phrases;
    priority;
}
__decorate([
    ApiProperty({ enum: ["manual", "new_conversation", "phrase", "always_except"] }),
    __metadata("design:type", String)
], BotScenarioTriggerRuleDto.prototype, "type", void 0);
__decorate([
    ApiPropertyOptional({ enum: ["exact", "contains", "tokens"] }),
    __metadata("design:type", String)
], BotScenarioTriggerRuleDto.prototype, "matchMode", void 0);
__decorate([
    ApiPropertyOptional({ type: [String], description: "Include phrases for phrase triggers; exclusion phrases for always_except." }),
    __metadata("design:type", Array)
], BotScenarioTriggerRuleDto.prototype, "phrases", void 0);
__decorate([
    ApiPropertyOptional(),
    __metadata("design:type", Number)
], BotScenarioTriggerRuleDto.prototype, "priority", void 0);
export class BotScenarioDto {
    id;
    name;
    channels;
    status;
    triggerRules;
    flowNodes;
    flowEdges;
    sourceBindings;
}
__decorate([
    ApiProperty({ example: "bot_delivery" }),
    __metadata("design:type", String)
], BotScenarioDto.prototype, "id", void 0);
__decorate([
    ApiProperty({ example: "Статус доставки" }),
    __metadata("design:type", String)
], BotScenarioDto.prototype, "name", void 0);
__decorate([
    ApiProperty({ type: [String], example: ["SDK"] }),
    __metadata("design:type", Array)
], BotScenarioDto.prototype, "channels", void 0);
__decorate([
    ApiProperty({ enum: ["draft", "published", "disabled", "archived"] }),
    __metadata("design:type", String)
], BotScenarioDto.prototype, "status", void 0);
__decorate([
    ApiPropertyOptional({ type: [BotScenarioTriggerRuleDto] }),
    __metadata("design:type", Array)
], BotScenarioDto.prototype, "triggerRules", void 0);
__decorate([
    ApiPropertyOptional({ description: "Flow nodes. Their detailed validation is returned by the service." }),
    __metadata("design:type", Array)
], BotScenarioDto.prototype, "flowNodes", void 0);
__decorate([
    ApiPropertyOptional({ description: "Directed flow edges." }),
    __metadata("design:type", Array)
], BotScenarioDto.prototype, "flowEdges", void 0);
__decorate([
    ApiPropertyOptional({ type: [Object], description: "Approved knowledge source bindings." }),
    __metadata("design:type", Array)
], BotScenarioDto.prototype, "sourceBindings", void 0);
export class BotScenarioMutationDto {
    id;
    name;
    channels;
    triggerRules;
    flowNodes;
    flowEdges;
    sourceBindings;
}
__decorate([
    ApiPropertyOptional({ example: "bot_delivery", description: "Optional for create; ignored when supplied in a path action." }),
    __metadata("design:type", String)
], BotScenarioMutationDto.prototype, "id", void 0);
__decorate([
    ApiPropertyOptional({ example: "Статус доставки" }),
    __metadata("design:type", String)
], BotScenarioMutationDto.prototype, "name", void 0);
__decorate([
    ApiPropertyOptional({ type: [String], example: ["SDK"] }),
    __metadata("design:type", Array)
], BotScenarioMutationDto.prototype, "channels", void 0);
__decorate([
    ApiPropertyOptional({ type: [BotScenarioTriggerRuleDto] }),
    __metadata("design:type", Array)
], BotScenarioMutationDto.prototype, "triggerRules", void 0);
__decorate([
    ApiPropertyOptional({ type: [Object] }),
    __metadata("design:type", Array)
], BotScenarioMutationDto.prototype, "flowNodes", void 0);
__decorate([
    ApiPropertyOptional({ type: [Object] }),
    __metadata("design:type", Array)
], BotScenarioMutationDto.prototype, "flowEdges", void 0);
__decorate([
    ApiPropertyOptional({ type: [Object] }),
    __metadata("design:type", Array)
], BotScenarioMutationDto.prototype, "sourceBindings", void 0);
export class BotScenarioPublishDto extends BotScenarioMutationDto {
    idempotencyKey;
}
__decorate([
    ApiPropertyOptional({ description: "Legacy body alternative to Idempotency-Key; the header has precedence." }),
    __metadata("design:type", String)
], BotScenarioPublishDto.prototype, "idempotencyKey", void 0);
export class BotScenarioActionDto {
    reason;
}
__decorate([
    ApiPropertyOptional({ example: "Обновление правил поддержки", maxLength: 500 }),
    __metadata("design:type", String)
], BotScenarioActionDto.prototype, "reason", void 0);
export class BotScenarioTestRunDto {
    name;
    testMessage;
    testCases;
}
__decorate([
    ApiPropertyOptional({ example: "Проверка доставки" }),
    __metadata("design:type", String)
], BotScenarioTestRunDto.prototype, "name", void 0);
__decorate([
    ApiPropertyOptional({ example: "Где мой заказ?" }),
    __metadata("design:type", String)
], BotScenarioTestRunDto.prototype, "testMessage", void 0);
__decorate([
    ApiPropertyOptional({ type: [Object] }),
    __metadata("design:type", Array)
], BotScenarioTestRunDto.prototype, "testCases", void 0);
export class BotSandboxSessionCreateDto {
    channel;
    locale;
    mode;
}
__decorate([
    ApiPropertyOptional({ example: "SDK", description: "Channel to simulate; defaults to the scenario's first channel." }),
    __metadata("design:type", String)
], BotSandboxSessionCreateDto.prototype, "channel", void 0);
__decorate([
    ApiPropertyOptional({ example: "ru-RU" }),
    __metadata("design:type", String)
], BotSandboxSessionCreateDto.prototype, "locale", void 0);
__decorate([
    ApiPropertyOptional({ enum: ["draft", "published"], description: "Which configuration to test; defaults to draft for draft scenarios, otherwise the published version." }),
    __metadata("design:type", String)
], BotSandboxSessionCreateDto.prototype, "mode", void 0);
export class BotSandboxMessageDto {
    messageId;
    text;
    quickReply;
    value;
    webhooksEnabled;
}
__decorate([
    ApiPropertyOptional({ example: "msg-1", description: "Client-generated id; repeating it replays the stored turn instead of running the bot again." }),
    __metadata("design:type", String)
], BotSandboxMessageDto.prototype, "messageId", void 0);
__decorate([
    ApiPropertyOptional({ example: "Где мой заказ №123?" }),
    __metadata("design:type", String)
], BotSandboxMessageDto.prototype, "text", void 0);
__decorate([
    ApiPropertyOptional({ description: "Quick-reply label when answering a quick_replies step." }),
    __metadata("design:type", String)
], BotSandboxMessageDto.prototype, "quickReply", void 0);
__decorate([
    ApiPropertyOptional({ description: "Value for contact_request or condition steps." }),
    __metadata("design:type", Object)
], BotSandboxMessageDto.prototype, "value", void 0);
__decorate([
    ApiPropertyOptional({ description: "Execute webhook nodes for real instead of the sandbox stub." }),
    __metadata("design:type", Boolean)
], BotSandboxMessageDto.prototype, "webhooksEnabled", void 0);
export class AutomationEnvelopeDto {
    service;
    operation;
    status;
    traceId;
    data;
    error;
    meta;
}
__decorate([
    ApiProperty({ example: "automationService" }),
    __metadata("design:type", String)
], AutomationEnvelopeDto.prototype, "service", void 0);
__decorate([
    ApiProperty(),
    __metadata("design:type", String)
], AutomationEnvelopeDto.prototype, "operation", void 0);
__decorate([
    ApiProperty({ enum: ["ok", "invalid", "conflict", "error"] }),
    __metadata("design:type", String)
], AutomationEnvelopeDto.prototype, "status", void 0);
__decorate([
    ApiProperty(),
    __metadata("design:type", String)
], AutomationEnvelopeDto.prototype, "traceId", void 0);
__decorate([
    ApiProperty({ type: Object, description: "Operation-specific data. Errors are returned in the same envelope." }),
    __metadata("design:type", Object)
], AutomationEnvelopeDto.prototype, "data", void 0);
__decorate([
    ApiPropertyOptional({ type: Object }),
    __metadata("design:type", Object)
], AutomationEnvelopeDto.prototype, "error", void 0);
__decorate([
    ApiProperty({ type: Object }),
    __metadata("design:type", Object)
], AutomationEnvelopeDto.prototype, "meta", void 0);
//# sourceMappingURL=automation.openapi.dto.js.map