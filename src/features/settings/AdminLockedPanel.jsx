import React from "react";
import { ShieldCheck } from "lucide-react";
import { SectionTitle } from "../../ui.jsx";

export function AdminLockedPanel({ access, roleMode }) {
  return (
    <section className="work-panel admin-locked-panel" aria-label="Админские настройки скрыты">
      <SectionTitle title="Webhooks, API keys и Security" action="только администратор" />
      <div>
        <ShieldCheck size={22} />
        <strong>Админские настройки скрыты</strong>
        <span>{access.reason}. API ключи, webhook URL, trace ID, IP-адреса сессий и security alerts не отображаются в режиме {roleMode}.</span>
      </div>
    </section>
  );
}
