import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** Schema-only DTOs: runtime validation remains in AutomationService so old clients keep working. */
export class BotScenarioTriggerRuleDto {
  @ApiProperty({ enum: ["manual", "new_conversation", "phrase", "always_except"] }) type!: "manual" | "new_conversation" | "phrase" | "always_except";
  @ApiPropertyOptional({ enum: ["exact", "contains", "tokens"] }) matchMode?: "exact" | "contains" | "tokens";
  @ApiPropertyOptional({ type: [String], description: "Include phrases for phrase triggers; exclusion phrases for always_except." }) phrases?: string[];
  @ApiPropertyOptional() priority?: number;
}

export class BotScenarioDto {
  @ApiProperty({ example: "bot_delivery" }) id!: string;
  @ApiProperty({ example: "Статус доставки" }) name!: string;
  @ApiProperty({ type: [String], example: ["SDK"] }) channels!: string[];
  @ApiProperty({ enum: ["draft", "published", "disabled", "archived"] }) status!: string;
  @ApiPropertyOptional({ type: [BotScenarioTriggerRuleDto] }) triggerRules?: BotScenarioTriggerRuleDto[];
  @ApiPropertyOptional({ description: "Flow nodes. Their detailed validation is returned by the service." }) flowNodes?: Array<Record<string, unknown>>;
  @ApiPropertyOptional({ description: "Directed flow edges." }) flowEdges?: Array<Record<string, unknown>>;
  @ApiPropertyOptional({ type: [Object], description: "Approved knowledge source bindings." }) sourceBindings?: Array<Record<string, unknown>>;
}

export class BotScenarioMutationDto {
  @ApiPropertyOptional({ example: "bot_delivery", description: "Optional for create; ignored when supplied in a path action." }) id?: string;
  @ApiPropertyOptional({ example: "Статус доставки" }) name?: string;
  @ApiPropertyOptional({ type: [String], example: ["SDK"] }) channels?: string[];
  @ApiPropertyOptional({ type: [BotScenarioTriggerRuleDto] }) triggerRules?: BotScenarioTriggerRuleDto[];
  @ApiPropertyOptional({ type: [Object] }) flowNodes?: Array<Record<string, unknown>>;
  @ApiPropertyOptional({ type: [Object] }) flowEdges?: Array<Record<string, unknown>>;
  @ApiPropertyOptional({ type: [Object] }) sourceBindings?: Array<Record<string, unknown>>;
}

export class BotScenarioPublishDto extends BotScenarioMutationDto {
  @ApiPropertyOptional({ description: "Legacy body alternative to Idempotency-Key; the header has precedence." }) idempotencyKey?: string;
}

export class BotScenarioActionDto {
  @ApiPropertyOptional({ example: "Обновление правил поддержки", maxLength: 500 }) reason?: string;
}

export class BotScenarioTestRunDto {
  @ApiPropertyOptional({ example: "Проверка доставки" }) name?: string;
  @ApiPropertyOptional({ example: "Где мой заказ?" }) testMessage?: string;
  @ApiPropertyOptional({ type: [Object] }) testCases?: Array<Record<string, unknown>>;
}

export class BotSandboxSessionCreateDto {
  @ApiPropertyOptional({ example: "SDK", description: "Channel to simulate; defaults to the scenario's first channel." }) channel?: string;
  @ApiPropertyOptional({ example: "ru-RU" }) locale?: string;
  @ApiPropertyOptional({ enum: ["draft", "published"], description: "Which configuration to test; defaults to draft for draft scenarios, otherwise the published version." }) mode?: string;
}

export class BotSandboxMessageDto {
  @ApiPropertyOptional({ example: "msg-1", description: "Client-generated id; repeating it replays the stored turn instead of running the bot again." }) messageId?: string;
  @ApiPropertyOptional({ example: "Где мой заказ №123?" }) text?: string;
  @ApiPropertyOptional({ description: "Quick-reply label when answering a quick_replies step." }) quickReply?: string;
  @ApiPropertyOptional({ description: "Value for contact_request or condition steps." }) value?: unknown;
  @ApiPropertyOptional({ description: "Execute webhook nodes for real instead of the sandbox stub." }) webhooksEnabled?: boolean;
}

export class AutomationEnvelopeDto {
  @ApiProperty({ example: "automationService" }) service!: string;
  @ApiProperty() operation!: string;
  @ApiProperty({ enum: ["ok", "invalid", "conflict", "error"] }) status!: string;
  @ApiProperty() traceId!: string;
  @ApiProperty({ type: Object, description: "Operation-specific data. Errors are returned in the same envelope." }) data!: Record<string, unknown>;
  @ApiPropertyOptional({ type: Object }) error?: Record<string, unknown> | null;
  @ApiProperty({ type: Object }) meta!: Record<string, unknown>;
}
