import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { createPrismaClient } from "@support-communication/database";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId } from "@support-communication/observability";
import { composeMailMessage, sendSmtpMail } from "../mail/smtp-transport.js";
import { applicationBaseUrl, resolveServiceTransportConfig } from "../mail/service-mailer.js";
import type { TenantOperatorContext } from "../identity/tenant-operator-auth.js";

const SERVICE = "supportTickets";
const MAX_ATTACHMENTS = 10;
const ADMIN_RECIPIENT = "SUPPORT_TICKETS_ADMIN_EMAIL";
const prisma = createPrismaClient() as any;

@Injectable()
export class SupportTicketsService {
  async listForRequester(context: TenantOperatorContext): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tickets = await prisma.supportTicket.findMany({
      where: { requesterId: context.userId, tenantId: context.tenantId },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    return ok("listForRequester", { items: tickets.map(ticketToClient) });
  }

  async detailForRequester(ticketId: string, context: TenantOperatorContext): Promise<BackendEnvelope<Record<string, unknown>>> {
    const ticket = await this.findTicket(ticketId, { requesterId: context.userId, tenantId: context.tenantId });
    return ticket ? ok("detailForRequester", { ticket: ticketToClient(ticket) }) : missing("detailForRequester");
  }

  async create(payload: { attachments?: unknown[]; body?: string; subject?: string }, context: TenantOperatorContext): Promise<BackendEnvelope<Record<string, unknown>>> {
    const subject = text(payload.subject, 3, 160);
    const body = text(payload.body, 1, 10_000);
    if (!subject || !body) return invalid("create", "support_ticket_content_invalid", "Subject and message are required.");
    const requester = await prisma.tenantUser.findUnique({ where: { tenantId_id: { tenantId: context.tenantId, id: context.userId } } });
    if (!requester) return invalid("create", "requester_not_found", "Current user is not available.");
    const attachments = await this.validateAttachments(payload.attachments, context.tenantId);
    if (attachments === null) return invalid("create", "support_ticket_attachments_invalid", "Only uploaded and scan-clean files can be attached.");
    const now = new Date();
    const ticket = await prisma.supportTicket.create({
      data: {
        id: `st_${randomUUID()}`,
        tenantId: context.tenantId,
        requesterId: context.userId,
        requesterName: requester.name,
        requesterEmail: requester.email,
        subject,
        status: "open",
        lastMessageAt: now,
        messages: { create: { id: `stm_${randomUUID()}`, authorKind: "requester", authorId: context.userId, authorName: requester.name, body, attachments } }
      },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    void this.notifyAdmin(ticket, body, "new");
    return ok("create", { ticket: ticketToClient(ticket) });
  }

  async replyFromRequester(ticketId: string, payload: { attachments?: unknown[]; body?: string }, context: TenantOperatorContext): Promise<BackendEnvelope<Record<string, unknown>>> {
    const body = text(payload.body, 1, 10_000);
    if (!body) return invalid("replyFromRequester", "support_ticket_message_invalid", "Message is required.");
    const ticket = await this.findTicket(ticketId, { requesterId: context.userId, tenantId: context.tenantId });
    if (!ticket) return missing("replyFromRequester");
    const attachments = await this.validateAttachments(payload.attachments, context.tenantId);
    if (attachments === null) return invalid("replyFromRequester", "support_ticket_attachments_invalid", "Only uploaded and scan-clean files can be attached.");
    const updated = await prisma.supportTicket.update({
      where: { id: ticketId }, data: { status: "open", lastMessageAt: new Date(), messages: { create: { id: `stm_${randomUUID()}`, authorKind: "requester", authorId: context.userId, authorName: ticket.requesterName, body, attachments } } },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    void this.notifyAdmin(updated, body, "reply");
    return ok("replyFromRequester", { ticket: ticketToClient(updated) });
  }

  async listForAdmin(filters: { query?: string; status?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const status = String(filters.status ?? "").trim();
    const query = String(filters.query ?? "").trim();
    const where: any = {
      ...(status && status !== "all" ? { status } : {}),
      ...(query ? { OR: [{ subject: { contains: query, mode: "insensitive" } }, { requesterEmail: { contains: query, mode: "insensitive" } }, { requesterName: { contains: query, mode: "insensitive" } }] } : {})
    };
    const tickets = await prisma.supportTicket.findMany({ where, orderBy: { updatedAt: "desc" }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    return ok("listForAdmin", { items: tickets.map(ticketToClient) });
  }

  async detailForAdmin(ticketId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const ticket = await this.findTicket(ticketId);
    return ticket ? ok("detailForAdmin", { ticket: ticketToClient(ticket) }) : missing("detailForAdmin");
  }

  async replyFromAdmin(ticketId: string, payload: { body?: string; status?: string }, actor?: { id?: string; name?: string; email?: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    const body = text(payload.body, 1, 10_000);
    if (!body) return invalid("replyFromAdmin", "support_ticket_message_invalid", "Message is required.");
    const ticket = await this.findTicket(ticketId);
    if (!ticket) return missing("replyFromAdmin");
    const status = normalizeStatus(payload.status) ?? "in_progress";
    const authorName = String(actor?.name ?? actor?.email ?? "Администратор сервиса").trim();
    const updated = await prisma.supportTicket.update({
      where: { id: ticketId }, data: { status, lastMessageAt: new Date(), messages: { create: { id: `stm_${randomUUID()}`, authorKind: "admin", authorId: String(actor?.id ?? "") || null, authorName, body, attachments: [] } } },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    void this.notifyRequester(updated, body);
    return ok("replyFromAdmin", { ticket: ticketToClient(updated) });
  }

  async changeStatus(ticketId: string, rawStatus: string | undefined, actor?: { id?: string; name?: string; email?: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    const status = normalizeStatus(rawStatus);
    if (!status) return invalid("changeStatus", "support_ticket_status_invalid", "Unsupported ticket status.");
    const ticket = await this.findTicket(ticketId);
    if (!ticket) return missing("changeStatus");
    const updated = await prisma.supportTicket.update({ where: { id: ticketId }, data: { status }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    if (status === "closed") void this.notifyRequester(updated, `Статус обращения изменён на «Закрыто».`);
    return ok("changeStatus", { ticket: ticketToClient(updated), changedBy: String(actor?.name ?? actor?.email ?? "Администратор сервиса") });
  }

  private async findTicket(id: string, where: Record<string, string> = {}): Promise<any | null> {
    return prisma.supportTicket.findFirst({ where: { id, ...where }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  }

  private async validateAttachments(input: unknown, tenantId: string): Promise<Array<Record<string, unknown>> | null> {
    const requested = Array.isArray(input) ? input : [];
    if (requested.length > MAX_ATTACHMENTS) return null;
    const fileIds = requested.map((item) => String((item as Record<string, unknown>)?.fileId ?? "").trim()).filter(Boolean);
    if (fileIds.length !== requested.length || new Set(fileIds).size !== fileIds.length) return null;
    if (!fileIds.length) return [];
    const files = await prisma.workspaceFile.findMany({ where: { tenantId, fileId: { in: fileIds }, storageState: "uploaded", scanState: { in: ["clean", "scan_clean"] }, scanVerdict: "clean" } });
    if (files.length !== fileIds.length) return null;
    const byId = new Map(files.map((file: any) => [file.fileId, file]));
    return fileIds.map((fileId) => { const file = byId.get(fileId)! as any; return { fileId, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: Number(file.sizeBytes) }; });
  }

  private async notifyAdmin(ticket: any, body: string, kind: "new" | "reply"): Promise<void> {
    const recipient = String(process.env[ADMIN_RECIPIENT] ?? "").trim();
    if (!recipient) return;
    await this.sendMail(recipient, `Обращение ${ticket.id}: ${ticket.subject}`, [
      kind === "new" ? "Создано новое обращение в поддержку." : "Пользователь добавил сообщение в обращение.",
      `Тема: ${ticket.subject}`, `Отправитель: ${ticket.requesterName} <${ticket.requesterEmail}>`, "", body, "", this.adminLink(ticket.id)
    ]);
  }

  private async notifyRequester(ticket: any, body: string): Promise<void> {
    await this.sendMail(ticket.requesterEmail, `Ответ поддержки: ${ticket.subject}`, ["В вашем обращении появился ответ.", `Тема: ${ticket.subject}`, "", body, "", this.requesterLink(ticket.id)]);
  }

  private async sendMail(to: string, subject: string, bodyLines: string[]): Promise<void> {
    try {
      const resolved = await resolveServiceTransportConfig();
      if (!resolved) return;
      const message = composeMailMessage(resolved.config, { to, subject, bodyLines });
      await sendSmtpMail(resolved.config, { to, message });
    } catch { /* Почта не должна отменять уже записанное обращение; delivery наблюдается настройками SMTP. */ }
  }

  private requesterLink(ticketId: string): string { const base = applicationBaseUrl() ?? ""; return base ? `${base}/#/app/support/${encodeURIComponent(ticketId)}` : `Обращение: ${ticketId}`; }
  private adminLink(ticketId: string): string { const base = applicationBaseUrl() ?? ""; return base ? `${base}/service-admin?workspace=support&ticket=${encodeURIComponent(ticketId)}` : `Обращение: ${ticketId}`; }
}

function ticketToClient(ticket: any): Record<string, unknown> {
  return { id: ticket.id, subject: ticket.subject, status: ticket.status, requester: { id: ticket.requesterId, name: ticket.requesterName, email: ticket.requesterEmail }, createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(), messages: (ticket.messages ?? []).map((message: any) => ({ id: message.id, authorKind: message.authorKind, authorName: message.authorName, body: message.body, attachments: message.attachments ?? [], createdAt: message.createdAt.toISOString() })) };
}
function text(value: unknown, min: number, max: number): string | null { const normalized = String(value ?? "").trim(); return normalized.length >= min && normalized.length <= max ? normalized : null; }
function normalizeStatus(value: unknown): "open" | "in_progress" | "closed" | null { const status = String(value ?? "").trim(); return status === "open" || status === "in_progress" || status === "closed" ? status : null; }
function ok(operation: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> { return createEnvelope({ service: SERVICE, operation, traceId: createRequestTraceId(SERVICE, operation), data, meta: { source: "api", apiVersion: "v1" } }); }
function invalid(operation: string, code: string, message: string): BackendEnvelope<Record<string, unknown>> { return createEnvelope({ service: SERVICE, operation, traceId: createRequestTraceId(SERVICE, operation), status: "invalid", data: {}, error: { code, message } }); }
function missing(operation: string): BackendEnvelope<Record<string, unknown>> { return createEnvelope({ service: SERVICE, operation, traceId: createRequestTraceId(SERVICE, operation), status: "not_found", data: {}, error: { code: "support_ticket_not_found", message: "Support ticket was not found." } }); }
