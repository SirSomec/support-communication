import React, { useEffect, useMemo, useState } from "react";
import { Download, Filter, ShieldCheck, Sparkles, Tag } from "lucide-react";
import { submitClientExport, submitClientMerge, submitClientUnmerge } from "../../app/clientProfileActions.js";
import { maskPhone } from "../../app/dialogModel.js";
import { createScreenStateItems } from "../../app/screenState.js";
import { clientService } from "../../services/clientService.js";
import { ChannelBadge, EntityTable, ProductScreen, SectionTitle, ToolbarSearch } from "../../ui.jsx";
import "./clients.css";

function getClientId(client) {
  const phoneSuffix = (client?.phone ?? "").replace(/\D/g, "").slice(-4) || "0000";
  return `gig-${client?.id ?? "unknown"}-${phoneSuffix}`;
}

function getClientMutationProfileId(client) {
  if (client?.sourceProfileId) {
    return client.sourceProfileId;
  }

  if (client?.channel && client?.id) {
    return `src_${String(client.channel).toLowerCase()}_${client.id}`;
  }

  return client?.id ?? "";
}

function clientMatchesSegment(client, segmentId) {
  const [dimension, ...labelParts] = String(segmentId ?? "").split(":");
  const label = labelParts.join(":");
  if (!dimension || !label) {
    return true;
  }

  if (dimension === "channel") {
    return client.channel === label;
  }

  if (dimension === "device") {
    return client.device === label;
  }

  if (dimension === "topic") {
    return (client.topic || "No topic") === label;
  }

  return true;
}

export function ClientsScreen({ conversations, onBack, onToast, access }) {
  const [query, setQuery] = useState("");
  const [segments, setSegments] = useState([]);
  const [segmentsLoading, setSegmentsLoading] = useState(true);
  const [segmentsError, setSegmentsError] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [exportPending, setExportPending] = useState(false);
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? "");
  const [mergedIds, setMergedIds] = useState([]);
  useEffect(() => {
    let cancelled = false;

    async function loadSegments() {
      setSegmentsLoading(true);
      setSegmentsError("");
      const response = await clientService.fetchClientSegments();
      if (cancelled) {
        return;
      }

      if (response.status !== "ok") {
        setSegments([]);
        setSegmentsError(response.error?.message ?? "Не удалось загрузить сегменты клиентов.");
        setSegmentsLoading(false);
        return;
      }

      setSegments(Array.isArray(response.data?.segments) ? response.data.segments : []);
      setSegmentsLoading(false);
    }

    void loadSegments();
    return () => {
      cancelled = true;
    };
  }, []);
  const clients = useMemo(() => {
    return conversations
      .filter((client) => clientMatchesSegment(client, selectedSegmentId))
      .filter((client) => `${client.name} ${client.phone} ${client.channel} ${client.device} ${client.topic}`.toLowerCase().includes(query.toLowerCase()));
  }, [conversations, query, selectedSegmentId]);
  const selected = clients.find((client) => client.id === selectedId) ?? clients[0] ?? conversations[0] ?? null;
  const canMergeProfiles = Boolean(selected) && access.canViewSensitive;
  const canExportClients = !exportPending && !segmentsLoading && clients.length > 0;
  const visiblePhone = selected ? (access.canViewSensitive ? selected.phone : maskPhone(selected.phone)) : "";
  const visibleClientId = selected ? (access.canViewSensitive ? getClientId(selected) : `${getClientId(selected).slice(0, 8)}***`) : "";
  const duplicateCandidates = selected
    ? conversations
      .filter((client) => client.id !== selected.id)
      .map((client) => ({
        ...client,
        score: client.phone.slice(0, 6) === selected.phone.slice(0, 6) ? 94 : client.name.split(" ")[0] === selected.name.split(" ")[0] ? 82 : 64
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
    : [];

  async function mergeClient(candidate) {
    if (!canMergeProfiles) {
      onToast(access.reason);
      return;
    }

    if (mergedIds.includes(getClientMutationProfileId(candidate))) {
      return;
    }

    const result = await submitClientMerge({ candidate, primary: selected });
    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setMergedIds((current) => Array.from(new Set([...current, result.candidateId])));
    onToast(`${candidate.name} объединен с профилем ${selected.name}.`);
  }

  async function unmergeClient(candidate) {
    if (!canMergeProfiles) {
      onToast(access.reason);
      return;
    }

    const result = await submitClientUnmerge({ candidate, primary: selected });
    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setMergedIds((current) => current.filter((id) => id !== result.candidateId));
    onToast(`${candidate.name} вынесен в отдельный профиль.`);
  }

  async function exportClients() {
    if (!canExportClients) {
      onToast(segmentsError || "Нет строк клиентов для экспорта.");
      return;
    }

    setExportPending(true);
    const result = await submitClientExport({
      format: "json",
      reason: "Client segment export requested from workspace",
      ...(selectedSegmentId ? { segmentId: selectedSegmentId } : {})
    });
    setExportPending(false);

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    onToast(`Экспорт клиентов поставлен в очередь: ${result.fileName}.`);
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
        errors: duplicateCandidates.filter((candidate) => candidate.score >= 90 && !mergedIds.includes(getClientMutationProfileId(candidate))).length,
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
        <label className="client-segment-control">
          <Filter size={17} />
          <select aria-label="Сегмент клиентов" disabled={segmentsLoading || Boolean(segmentsError)} onChange={(event) => setSelectedSegmentId(event.target.value)} value={selectedSegmentId}>
            <option value="">{segmentsLoading ? "Загрузка сегментов" : "Все сегменты"}</option>
            {segments.map((segment) => (
              <option key={segment.id} value={segment.id}>{segment.label} · {segment.count}</option>
            ))}
          </select>
        </label>
        <button disabled={!canExportClients} onClick={() => void exportClients()} title={canExportClients ? "Создать backend descriptor экспорта" : (segmentsError || "Экспорт недоступен для пустой выборки.")} type="button"><Download size={17} /> {exportPending ? "Экспорт..." : "Экспорт"}</button>
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
            <button className={`entity-row ${selected?.id === client.id ? "selected" : ""}`} key={client.id} onClick={() => setSelectedId(client.id)}>
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
          {selected ? (
            <>
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
                const isMerged = mergedIds.includes(getClientMutationProfileId(candidate));

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
            </>
          ) : (
            <section className="work-panel">
              <SectionTitle title="Профиль клиента" action="API" />
              <div className="entity-empty">
                <strong>Нет данных клиентов</strong>
                <span>Backend вернул пустой список для текущего tenant.</span>
              </div>
            </section>
          )}
        </aside>
      </div>
    </ProductScreen>
  );
}
