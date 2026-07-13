import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { UnansweredQuestionRepository } from "./unanswered-question.repository.js";

const SERVICE = "knowledgeUnansweredService";

/** BAI-826: вопросы, на которые бот не нашёл знаний, — сырьё для новых статей. */
@ApiTags("knowledge-unanswered")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("knowledge/unanswered-questions")
export class UnansweredQuestionsController {
  private get repository(): UnansweredQuestionRepository {
    return UnansweredQuestionRepository.default();
  }

  @Get()
  @RequireTenantOperatorPermission("knowledge.read")
  @RequireServiceAdminAction("knowledge.read")
  @ApiOkResponse({ description: "Tenant-scoped unanswered client questions (PII redacted)" })
  list(@Req() request: TenantOperatorRequest & ServiceAdminRequest): BackendEnvelope<Record<string, unknown>> {
    return envelope("listUnansweredQuestions", tenantId(request), { questions: this.repository.list(tenantId(request)) });
  }

  @Post(":questionId/dismiss")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  dismiss(@Param("questionId") questionId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest): BackendEnvelope<Record<string, unknown>> {
    const question = this.repository.setStatus(tenantId(request), questionId, "dismissed");
    if (!question) return invalid("dismissUnansweredQuestion", tenantId(request));
    return envelope("dismissUnansweredQuestion", tenantId(request), { question });
  }

  @Post(":questionId/resolve")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  resolve(
    @Param("questionId") questionId: string,
    @Body() body: { articleId?: string } | null,
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ): BackendEnvelope<Record<string, unknown>> {
    const question = this.repository.setStatus(tenantId(request), questionId, "resolved", String(body?.articleId ?? "").trim() || null);
    if (!question) return invalid("resolveUnansweredQuestion", tenantId(request));
    return envelope("resolveUnansweredQuestion", tenantId(request), { question });
  }
}

function tenantId(request: TenantOperatorRequest & ServiceAdminRequest): string {
  return request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId ?? "";
}

function envelope(operation: string, tenant: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({ data, meta: { apiVersion: "v1", tenantId: tenant }, operation, service: SERVICE, traceId: `trc_${SERVICE}_${Date.now()}` });
}

function invalid(operation: string, tenant: string): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    data: {},
    error: { code: "unanswered_question_not_found", message: "Вопрос не найден." },
    meta: { apiVersion: "v1", tenantId: tenant },
    operation,
    service: SERVICE,
    status: "invalid",
    traceId: `trc_${SERVICE}_${Date.now()}`
  });
}
