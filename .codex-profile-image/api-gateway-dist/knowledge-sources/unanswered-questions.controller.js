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
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createEnvelope } from "@support-communication/envelope";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { UnansweredQuestionRepository } from "./unanswered-question.repository.js";
const SERVICE = "knowledgeUnansweredService";
/** BAI-826: вопросы, на которые бот не нашёл знаний, — сырьё для новых статей. */
// Namespace deliberately outside "knowledge/…": the workspace article controller
// owns the greedy "knowledge/:articleId" route and would otherwise shadow these.
let UnansweredQuestionsController = class UnansweredQuestionsController {
    get repository() {
        return UnansweredQuestionRepository.default();
    }
    async list(request) {
        return envelope("listUnansweredQuestions", tenantId(request), { questions: await this.repository.list(tenantId(request)) });
    }
    async dismiss(questionId, request) {
        const question = await this.repository.setStatus(tenantId(request), questionId, "dismissed");
        if (!question)
            return invalid("dismissUnansweredQuestion", tenantId(request));
        return envelope("dismissUnansweredQuestion", tenantId(request), { question });
    }
    async resolve(questionId, body, request) {
        const question = await this.repository.setStatus(tenantId(request), questionId, "resolved", String(body?.articleId ?? "").trim() || null);
        if (!question)
            return invalid("resolveUnansweredQuestion", tenantId(request));
        return envelope("resolveUnansweredQuestion", tenantId(request), { question });
    }
};
__decorate([
    Get(),
    RequireTenantOperatorPermission("knowledge.read"),
    RequireServiceAdminAction("knowledge.read"),
    ApiOkResponse({ description: "Tenant-scoped unanswered client questions (PII redacted)" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UnansweredQuestionsController.prototype, "list", null);
__decorate([
    Post(":questionId/dismiss"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("questionId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], UnansweredQuestionsController.prototype, "dismiss", null);
__decorate([
    Post(":questionId/resolve"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("questionId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], UnansweredQuestionsController.prototype, "resolve", null);
UnansweredQuestionsController = __decorate([
    ApiTags("knowledge-unanswered"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("knowledge-unanswered-questions")
], UnansweredQuestionsController);
export { UnansweredQuestionsController };
function tenantId(request) {
    return request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId ?? "";
}
function envelope(operation, tenant, data) {
    return createEnvelope({ data, meta: { apiVersion: "v1", tenantId: tenant }, operation, service: SERVICE, traceId: `trc_${SERVICE}_${Date.now()}` });
}
function invalid(operation, tenant) {
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
//# sourceMappingURL=unanswered-questions.controller.js.map