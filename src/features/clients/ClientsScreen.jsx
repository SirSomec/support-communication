import React, { useMemo, useState } from "react";
import { Download, Filter, ShieldCheck, Sparkles, Tag } from "lucide-react";
import { maskPhone } from "../../app/dialogModel.js";
import { createScreenStateItems } from "../../app/screenState.js";
import { clientService } from "../../services/index.js";
import { ChannelBadge, EntityTable, ProductScreen, SectionTitle, ToolbarSearch } from "../../ui.jsx";
import "./clients.css";

function getClientId(client) {
  return `gig-${client.id}-${client.phone.replace(/\D/g, "").slice(-4)}`;
}

export function ClientsScreen({ conversations, onBack, onToast, access }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? "");
  const [mergedIds, setMergedIds] = useState([]);
  const clients = useMemo(() => {
    return conversations.filter((client) => `${client.name} ${client.phone} ${client.channel} ${client.device} ${client.topic}`.toLowerCase().includes(query.toLowerCase()));
  }, [conversations, query]);
  const selected = conversations.find((client) => client.id === selectedId) ?? clients[0] ?? conversations[0];
  const canMergeProfiles = access.canViewSensitive;
  const visiblePhone = access.canViewSensitive ? selected.phone : maskPhone(selected.phone);
  const visibleClientId = access.canViewSensitive ? getClientId(selected) : `${getClientId(selected).slice(0, 8)}***`;
  const duplicateCandidates = conversations
    .filter((client) => client.id !== selected.id)
    .map((client) => ({
      ...client,
      score: client.phone.slice(0, 6) === selected.phone.slice(0, 6) ? 94 : client.name.split(" ")[0] === selected.name.split(" ")[0] ? 82 : 64
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  async function mergeClient(candidate) {
    if (!canMergeProfiles) {
      onToast(access.reason);
      return;
    }

    if (mergedIds.includes(candidate.id)) {
      return;
    }

    await clientService.mergeClientProfiles({ candidate, primary: selected });
    setMergedIds((current) => [...current, candidate.id]);
    onToast(`${candidate.name} объединен с профилем ${selected.name}.`);
  }

  async function unmergeClient(candidate) {
    if (!canMergeProfiles) {
      onToast(access.reason);
      return;
    }

    await clientService.unmergeClientProfile({ candidate, primary: selected });
    setMergedIds((current) => current.filter((id) => id !== candidate.id));
    onToast(`${candidate.name} вынесен в отдельный профиль.`);
  }

  return (
    <ProductScreen
      title="Клиенты"
      subtitle="Единые профили с телефонами, устройствами, точками входа и историей обращений."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: clients.length,
        empty: `${clients.length} профилей`,
        emptyWhenZero: "поиск без результатов",
        errors: duplicateCandidates.filter((candidate) => candidate.score >= 90 && !mergedIds.includes(candidate.id)).length,
        errorLabel: "дублей нет"
      })}
      actions={
        <button className="primary-action" disabled={!canMergeProfiles} onClick={() => duplicateCandidates[0] ? mergeClient(duplicateCandidates[0]) : onToast("Потенциальных дублей не найдено.")} title={canMergeProfiles ? "Объединить ближайший дубль" : access.reason}>
          <Sparkles size={17} />
          Объединить дубли
        </button>
      }
    >
      <div className="screen-toolbar">
        <ToolbarSearch value={query} onChange={setQuery} placeholder="Поиск по телефону, имени или каналу" />
        <button><Filter size={17} /> Сегмент</button>
        <button><Download size={17} /> Экспорт</button>
      </div>

      <div className="clients-workspace">
        <EntityTable
          className="clients-table"
          columns={["Клиент", "Телефон", "Канал", "Устройство", "Тематика", "История"]}
          empty={!clients.length ? (
            <div className="entity-empty">
              <strong>Клиенты не найдены</strong>
              <span>Измените поисковый запрос или фильтр сегмента.</span>
            </div>
          ) : null}
        >
          {clients.map((client) => (
            <button className={`entity-row ${selected.id === client.id ? "selected" : ""}`} key={client.id} onClick={() => setSelectedId(client.id)}>
              <strong>{client.name}</strong>
              <span>{access.canViewSensitive ? client.phone : maskPhone(client.phone)}</span>
              <ChannelBadge channel={client.channel} />
              <span>{client.device}</span>
              <span>{client.topic || "Не выбрана"}</span>
              <span>{client.previous.length} закрытых</span>
            </button>
          ))}
        </EntityTable>

        <aside className="client-detail-panel">
          <section className="work-panel">
            <SectionTitle title="Профиль клиента" action={selected.channel} />
            <div className="client-profile-head">
              <span className={`avatar avatar-fallback ${selected.channel.toLowerCase()}`}>{selected.initials}</span>
              <div>
                <strong>{selected.name}</strong>
                <span>{visibleClientId}</span>
              </div>
            </div>
            <div className="detail-stack compact">
              <div><span>Телефон</span><strong>{visiblePhone}</strong></div>
              <div><span>Устройство</span><strong>{selected.device}</strong></div>
              <div><span>Точка входа</span><strong>{selected.entry}</strong></div>
              <div><span>Клиент с</span><strong>{selected.clientSince}</strong></div>
              <div><span>Язык</span><strong>{selected.language}</strong></div>
              <div><span>Текущая тематика</span><strong>{selected.topic || "Не выбрана"}</strong></div>
            </div>
            {!access.canViewSensitive ? (
              <div className="client-privacy-note">
                <ShieldCheck size={15} />
                Телефон и client ID замаскированы для текущей роли.
              </div>
            ) : null}
            <div className="tag-list">
              {selected.tags.map((tag) => <span key={tag}><Tag size={13} />{tag}</span>)}
            </div>
          </section>

          <section className="work-panel">
            <SectionTitle title="Дубли и объединение" action={`${mergedIds.length} объединено`} />
            {!canMergeProfiles ? (
              <div className="client-privacy-note">
                <ShieldCheck size={15} />
                {access.reason}
              </div>
            ) : null}
            <div className="duplicate-list">
              {duplicateCandidates.map((candidate) => {
                const isMerged = mergedIds.includes(candidate.id);

                return (
                  <article className={`duplicate-row ${isMerged ? "merged" : ""}`} key={candidate.id}>
                    <header>
                      <strong>{candidate.name}</strong>
                      <b>{candidate.score}%</b>
                    </header>
                    <span>{access.canViewSensitive ? candidate.phone : maskPhone(candidate.phone)} · {candidate.channel} · {candidate.device}</span>
                    <footer>
                      <small>{candidate.topic || "Без тематики"}</small>
                      <button disabled={!canMergeProfiles} onClick={() => isMerged ? unmergeClient(candidate) : mergeClient(candidate)} title={canMergeProfiles ? "Изменить связь профилей" : access.reason} type="button">
                        {isMerged ? "Разъединить" : "Объединить"}
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="work-panel">
            <SectionTitle title="История обращений" action={`${selected.previous.length + 1} всего`} />
            <div className="client-history-list">
              <article>
                <time>Сейчас</time>
                <strong>{selected.topic || "Активный диалог"}</strong>
                <span>{selected.channel} · {selected.status}</span>
              </article>
              {selected.previous.map(([date, topic, status]) => (
                <article key={`${date}-${topic}`}>
                  <time>{date}</time>
                  <strong>{topic}</strong>
                  <span>{status}</span>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </ProductScreen>
  );
}
