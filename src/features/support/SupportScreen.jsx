import React, { useCallback, useEffect, useRef, useState } from "react";
import { FilePlus2, MessageCircleMore, Paperclip, Send, X } from "lucide-react";
import { supportTicketService } from "../../services/supportTicketService.js";
import "./support.css";

const statusLabel = { open: "Открыто", in_progress: "В работе", closed: "Закрыто" };

export function SupportScreen({ onToast }) {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const fileInput = useRef(null);
  const selected = tickets.find((item) => item.id === selectedId) ?? null;
  const load = useCallback(async () => {
    setLoading(true);
    const response = await supportTicketService.list();
    setLoading(false);
    if (response.status !== "ok") return onToast(response.error?.message ?? "Не удалось загрузить обращения.");
    const items = response.data?.items ?? [];
    setTickets(items);
    const ticketFromUrl = window.location.hash.match(/^#\/app\/support\/([^/?]+)/)?.[1] ?? "";
    setSelectedId((current) => current || ticketFromUrl || items[0]?.id || "");
  }, [onToast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const pending = attachments.filter((item) => !["scan_clean", "clean", "scan_blocked"].includes(item.scanState));
    if (!pending.length) return undefined;
    const timer = window.setInterval(() => {
      void Promise.all(pending.map(async (item) => ({ fileId: item.fileId, response: await supportTicketService.attachmentStatus(item.fileId) }))).then((results) => {
        setAttachments((current) => current.map((item) => {
          const result = results.find((entry) => entry.fileId === item.fileId)?.response;
          return result?.status === "ok" ? { ...item, scanState: result.data?.scanState ?? item.scanState } : item;
        }));
      });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [attachments]);

  async function attach(event) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    for (const file of files) {
      const response = await supportTicketService.upload(file);
      if (response.status !== "ok") { onToast(response.error?.message ?? `Не удалось загрузить ${file.name}`); continue; }
      setAttachments((current) => [...current, { fileId: response.data?.fileId, fileName: file.name, scanState: response.data?.scanState ?? "pending" }]);
      onToast(`Файл «${file.name}» загружен и отправлен на проверку.`);
    }
  }
  async function submit(event) {
    event.preventDefault();
    if (!message.trim()) return;
    if (attachments.some((item) => !["scan_clean", "clean"].includes(item.scanState))) return onToast("Дождитесь завершения проверки вложений и повторите отправку.");
    setSending(true);
    const response = selected ? await supportTicketService.reply(selected.id, { body: message, attachments }) : await supportTicketService.create({ subject, body: message, attachments });
    setSending(false);
    if (response.status !== "ok") return onToast(response.error?.message ?? "Не удалось отправить обращение.");
    const ticket = response.data?.ticket;
    setTickets((current) => [ticket, ...current.filter((item) => item.id !== ticket.id)]);
    setSelectedId(ticket.id); setMessage(""); setSubject(""); setAttachments([]);
    onToast(selected ? "Сообщение отправлено в поддержку." : "Обращение создано. Мы уведомили службу поддержки.");
  }
  return <section className="support-screen">
    <aside className="support-ticket-list"><div className="support-list-heading"><div><h1>Поддержка</h1><p>Обращения и ответы службы поддержки</p></div><button className="support-new" onClick={() => { setSelectedId(""); setMessage(""); setSubject(""); setAttachments([]); }} type="button">Новое</button></div>
      {loading ? <p className="support-muted">Загружаем обращения…</p> : tickets.length ? tickets.map((ticket) => <button className={`support-ticket-row ${selectedId === ticket.id ? "selected" : ""}`} key={ticket.id} onClick={() => setSelectedId(ticket.id)} type="button"><strong>{ticket.subject}</strong><span>{statusLabel[ticket.status] ?? ticket.status}</span><small>{new Date(ticket.updatedAt).toLocaleString("ru-RU")}</small></button>) : <p className="support-muted">Здесь появятся ваши обращения.</p>}
    </aside>
    <div className="support-thread">{selected ? <><header className="support-thread-header"><div><span>Обращение {selected.id}</span><h2>{selected.subject}</h2></div><b className={`support-status ${selected.status}`}>{statusLabel[selected.status] ?? selected.status}</b></header><div className="support-messages">{selected.messages.map((item) => <article className={`support-message ${item.authorKind}`} key={item.id}><strong>{item.authorKind === "admin" ? "Поддержка" : item.authorName}</strong><p>{item.body}</p>{item.attachments?.length ? <div className="support-attachments">{item.attachments.map((file) => <span key={file.fileId}><FilePlus2 size={14} />{file.fileName}</span>)}</div> : null}<time>{new Date(item.createdAt).toLocaleString("ru-RU")}</time></article>)}</div></> : <header className="support-thread-header support-new-ticket"><MessageCircleMore size={28}/><div><span>Новое обращение</span><h2>Расскажите, чем помочь</h2></div></header>}
      <form className="support-composer" onSubmit={submit}>{!selected ? <input maxLength="160" onChange={(event) => setSubject(event.target.value)} placeholder="Тема обращения" required value={subject} /> : null}<textarea maxLength="10000" onChange={(event) => setMessage(event.target.value)} placeholder="Опишите вопрос или ответьте поддержке" required value={message} />{attachments.length ? <div className="support-upload-list">{attachments.map((file) => <span key={file.fileId}>{file.fileName}<small>{["scan_clean", "clean"].includes(file.scanState) ? "проверен" : "проверяется"}</small><button onClick={() => setAttachments((current) => current.filter((item) => item.fileId !== file.fileId))} type="button"><X size={14}/></button></span>)}</div> : null}<div className="support-composer-actions"><input accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" hidden multiple onChange={attach} ref={fileInput} type="file"/><button className="support-attach" onClick={() => fileInput.current?.click()} type="button"><Paperclip size={17}/>Прикрепить фото или файл</button><button className="support-send" disabled={sending} type="submit"><Send size={17}/>{sending ? "Отправляем…" : selected ? "Отправить" : "Создать обращение"}</button></div></form>
    </div>
  </section>;
}
