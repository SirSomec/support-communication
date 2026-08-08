import React, { useCallback, useEffect, useState } from "react";
import { CheckCheck, FilePlus2, Send } from "lucide-react";
import { supportTicketAdminService } from "../../services/supportTicketAdminService.js";
const statusLabel = {
  open: "Открыто",
  in_progress: "В работе",
  closed: "Закрыто",
};
export function SupportTicketsWorkspace({ onAudit, onToast }) {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const selected = tickets.find((item) => item.id === selectedId) ?? null;
  const load = useCallback(async () => {
    setLoading(true);
    const response = await supportTicketAdminService.list({ status });
    setLoading(false);
    if (response.status !== "ok")
      return onToast(
        response.error?.message ?? "Не удалось загрузить обращения.",
      );
    const items = response.data?.items ?? [];
    const ticketFromUrl =
      new URLSearchParams(window.location.search).get("ticket") ?? "";
    setTickets(items);
    setSelectedId((current) => current || ticketFromUrl || items[0]?.id || "");
  }, [onToast, status]);
  useEffect(() => {
    void load();
  }, [load]);
  async function reply(event) {
    event.preventDefault();
    if (!selected || !message.trim()) return;
    const response = await supportTicketAdminService.reply(selected.id, {
      body: message,
      status: "in_progress",
    });
    if (response.status !== "ok")
      return onToast(response.error?.message ?? "Не удалось отправить ответ.");
    const ticket = response.data.ticket;
    setTickets((current) => [
      ticket,
      ...current.filter((item) => item.id !== ticket.id),
    ]);
    setMessage("");
    onAudit?.(response, { action: "support_ticket.reply" });
    onToast("Ответ отправлен пользователю по почте и в обращении.");
  }
  async function changeStatus(nextStatus) {
    if (!selected) return;
    const response = await supportTicketAdminService.changeStatus(
      selected.id,
      nextStatus,
    );
    if (response.status !== "ok")
      return onToast(response.error?.message ?? "Не удалось изменить статус.");
    const ticket = response.data.ticket;
    setTickets((current) =>
      current.map((item) => (item.id === ticket.id ? ticket : item)),
    );
    onAudit?.(response, { action: "support_ticket.status" });
  }
  return (
    <section className="service-support-workspace">
      <div className="service-support-toolbar">
        <p>
          Пользователь получает письмо со ссылкой при каждом ответе. Новые
          сообщения отправляются на адрес из{" "}
          <code>SUPPORT_TICKETS_ADMIN_EMAIL</code>.
        </p>
        <label>
          Статус
          <select
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="all">Все</option>
            <option value="open">Открытые</option>
            <option value="in_progress">В работе</option>
            <option value="closed">Закрытые</option>
          </select>
        </label>
      </div>
      <div className="service-support-layout">
        <aside>
          {loading ? (
            <p>Загрузка…</p>
          ) : (
            tickets.map((ticket) => (
              <button
                className={selectedId === ticket.id ? "selected" : ""}
                key={ticket.id}
                onClick={() => setSelectedId(ticket.id)}
                type="button"
              >
                <strong>{ticket.subject}</strong>
                <span>{ticket.requester.name}</span>
                <small>{statusLabel[ticket.status]}</small>
              </button>
            ))
          )}
        </aside>
        <div className="service-support-thread">
          {selected ? (
            <>
              <header>
                <div>
                  <span>
                    {selected.id} · {selected.requester.email}
                  </span>
                  <h2>{selected.subject}</h2>
                </div>
                <select
                  onChange={(event) => changeStatus(event.target.value)}
                  value={selected.status}
                >
                  <option value="open">Открыто</option>
                  <option value="in_progress">В работе</option>
                  <option value="closed">Закрыто</option>
                </select>
              </header>
              <div className="service-support-messages">
                {selected.messages.map((item) => (
                  <article className={item.authorKind} key={item.id}>
                    <strong>
                      {item.authorKind === "admin"
                        ? "Поддержка"
                        : item.authorName}
                    </strong>
                    <p>{item.body}</p>
                    {item.attachments?.length ? (
                      <div className="service-support-attachments">
                        {item.attachments.map((file) => (
                          <span key={file.fileId} title={file.mimeType ?? "Attachment"}>
                            <FilePlus2 size={15} />
                            {file.fileName}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <time>
                      {new Date(item.createdAt).toLocaleString("ru-RU")}
                    </time>
                  </article>
                ))}
              </div>
              <form onSubmit={reply}>
                <textarea
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Напишите ответ пользователю"
                  value={message}
                />
                <button className="primary" type="submit">
                  <Send size={16} />
                  Отправить ответ
                </button>
                {selected.status !== "closed" ? (
                  <button onClick={() => changeStatus("closed")} type="button">
                    <CheckCheck size={16} />
                    Закрыть
                  </button>
                ) : null}
              </form>
            </>
          ) : (
            <p>Выберите обращение.</p>
          )}
        </div>
      </div>
    </section>
  );
}
