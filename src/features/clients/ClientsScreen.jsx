import React, { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, Download, Filter, LoaderCircle, Megaphone, ShieldCheck, Sparkles, Tag } from "lucide-react";
import { submitClientExport, submitClientMerge, submitClientUnmerge } from "../../app/clientProfileActions.js";
import { buildSourceProfileId, groupConversationsIntoClientProfiles, normalizeClientPhone } from "../../app/clientProfileModel.js";
import { maskPhone } from "../../app/dialogModel.js";
import { createScreenStateItems } from "../../app/screenState.js";
import { clientService } from "../../services/clientService.js";
import { marketingService } from "../../services/marketingService.js";
import { ChannelBadge, EntityTable, ProductScreen, SectionTitle, ToolbarSearch } from "../../ui.jsx";
import "./clients.css";

function getClientId(client) {
  const identityKey = String(client?.clientIdentityKey ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 16) || "client";
  const phoneSuffix = normalizeClientPhone(client?.phone).slice(-4) || "0000";
  return `gig-${identityKey}-${phoneSuffix}`;
}

function getClientMutationProfileId(client) {
  if (client?.sourceProfileId) {
    return client.sourceProfileId;
  }

  const stableProfileId = buildSourceProfileId(client);
  if (stableProfileId) {
    return stableProfileId;
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
  const [selectedId, setSelectedId] = useState("");
  const [mergedIds, setMergedIds] = useState([]);
  const [marketingDraft, setMarketingDraft] = useState("");
  const [marketingSending, setMarketingSending] = useState(false);
  const [marketingConsents, setMarketingConsents] = useState([]);
  const [marketingChannels, setMarketingChannels] = useState([]);
  const [marketingRestrictions, setMarketingRestrictions] = useState([]);
  const [restrictionSavingChannel, setRestrictionSavingChannel] = useState("");
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
    return groupConversationsIntoClientProfiles(conversations)
      .filter((client) => clientMatchesSegment(client, selectedSegmentId))
      .filter((client) => `${client.name} ${client.phone} ${client.channel} ${client.device} ${client.topic}`.toLowerCase().includes(query.toLowerCase()));
  }, [conversations, query, selectedSegmentId]);
  useEffect(() => {
    if (!clients.length) {
      if (selectedId) {
        setSelectedId("");
      }
      return;
    }

    if (!clients.some((client) => client.clientIdentityKey === selectedId)) {
      setSelectedId(clients[0].clientIdentityKey);
    }
  }, [clients, selectedId]);
  const selected = clients.find((client) => client.clientIdentityKey === selectedId) ?? clients[0] ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!selected) { setMarketingChannels([]); setMarketingConsents([]); setMarketingRestrictions([]); return undefined; }
    setMarketingChannels([selected.channel]);
    setMarketingConsents([]);
    setMarketingRestrictions([]);
    void marketingService.getClientPreferences(getClientMutationProfileId(selected)).then((response) => {
      if (!cancelled && response.status === "ok") {
        setMarketingChannels(response.data?.channels ?? [selected.channel]);
        setMarketingConsents(response.data?.consents ?? []);
        setMarketingRestrictions(response.data?.restrictions ?? []);
      }
    });
    return () => { cancelled = true; };
  }, [selected?.clientIdentityKey, selected?.sourceProfileId]);
  const canMergeProfiles = Boolean(selected) && access.canViewSensitive;
  const canExportClients = !exportPending && !segmentsLoading && clients.length > 0;
  const visiblePhone = selected ? (access.canViewSensitive ? selected.phone : maskPhone(selected.phone)) : "";
  const visibleClientId = selected ? (access.canViewSensitive ? getClientId(selected) : `${getClientId(selected).slice(0, 8)}***`) : "";
  const selectedChannelRestricted = Boolean(selected) && marketingRestrictions.some((restriction) => restriction.blocked && String(restriction.channel).toLowerCase() === String(selected.channel).toLowerCase());
  const duplicateCandidates = selected
    ? clients
      .filter((client) => client.clientIdentityKey !== selected.clientIdentityKey)
      .map((client) => ({
        ...client,
        score: normalizeClientPhone(client.phone) === normalizeClientPhone(selected.phone) ? 94 : client.name.split(" ")[0] === selected.name.split(" ")[0] ? 82 : 64
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

  async function createPersonalMarketingDraft(event) {
    event.preventDefault();
    if (!selected || !marketingDraft.trim()) return;
    setMarketingSending(true);
    const response = await marketingService.createCampaign({
      channels: [selected.channel],
      content: { blocks: [{ type: "text", text: marketingDraft.trim() }] },
      sourceProfileIds: [getClientMutationProfileId(selected)],
      strategy: "preferred",
      title: `Персонально · ${selected.name}`
    });
    setMarketingSending(false);
    if (response.status !== "ok") { onToast(response.error?.message ?? "Не удалось создать персональную коммуникацию."); return; }
    setMarketingDraft("");
    onToast("Персональная коммуникация создана в черновиках раздела «Коммуникации».");
  }

  async function withdrawMarketingConsent() {
    if (!selected) return;
    const response = await marketingService.recordConsent({ clientId: getClientMutationProfileId(selected), channel: selected.channel, status: "withdrawn" });
    if (response.status !== "ok") { onToast(response.error?.message ?? "Не удалось отозвать согласие."); return; }
    setMarketingConsents((current) => [...current.filter((consent) => consent.channel !== selected.channel), response.data?.consent].filter(Boolean));
    onToast("Согласие отозвано. Это действие зарегистрировано для выбранного канала.");
  }

  async function toggleChannelRestriction(channel, blocked) {
    if (!selected || restrictionSavingChannel) return;
    const normalizedChannel = String(channel).toLowerCase();
    const previousRestrictions = marketingRestrictions;
    setRestrictionSavingChannel(normalizedChannel);
    setMarketingRestrictions((current) => blocked
      ? [...current.filter((item) => String(item.channel).toLowerCase() !== normalizedChannel), { blocked: true, channel: normalizedChannel, clientId: getClientMutationProfileId(selected) }]
      : current.filter((item) => String(item.channel).toLowerCase() !== normalizedChannel));
    const response = await marketingService.updateClientChannelRestriction(getClientMutationProfileId(selected), {
      blocked,
      channel: normalizedChannel,
      conversationId: selected.id,
      reason: "Изменено вручную в карточке клиента"
    });
    setRestrictionSavingChannel("");
    if (response.status !== "ok") {
      setMarketingRestrictions(previousRestrictions);
      onToast(response.error?.message ?? "Не удалось изменить запрет коммуникаций.");
      return;
    }
    setMarketingRestrictions((current) => blocked
      ? [...current.filter((item) => String(item.channel).toLowerCase() !== normalizedChannel), response.data?.restriction].filter(Boolean)
      : current.filter((item) => String(item.channel).toLowerCase() !== normalizedChannel));
    onToast(blocked ? `Коммуникации в канале ${channel} запрещены.` : `Коммуникации в канале ${channel} снова разрешены.`);
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
            <button className={`entity-row ${selected?.clientIdentityKey === client.clientIdentityKey ? "selected" : ""}`} key={client.clientIdentityKey} onClick={() => setSelectedId(client.clientIdentityKey)}>
              <strong>{client.name}</strong>
              <span>{access.canViewSensitive ? client.phone : maskPhone(client.phone)}</span>
              <ChannelBadge channel={client.channel} />
              <span>{client.device}</span>
              <span>{client.topic || "Не выбрана"}</span>
              <span>{client.appealCount} обращ. · {client.previous.length} закрытых</span>
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
            <SectionTitle title="Маркетинговая коммуникация" action={selected.channel} />
            <form className="client-marketing-form" onSubmit={createPersonalMarketingDraft}>
              <p>Создаёт персональный черновик для этого клиента. Перед запуском будут проверены канал и согласие.</p>
              <textarea maxLength={4000} onChange={(event) => setMarketingDraft(event.target.value)} placeholder="Текст сообщения, эмодзи и переменные" value={marketingDraft} />
              <button className="primary-action" disabled={marketingSending || selectedChannelRestricted || !marketingDraft.trim()} title={selectedChannelRestricted ? "Для этого клиента запрещены коммуникации в выбранном канале" : undefined} type="submit"><Megaphone size={16} /> {marketingSending ? "Создаём…" : "Создать черновик"}</button>
            </form>
            <div className="client-marketing-consent"><strong>{"\u0421\u043e\u0433\u043b\u0430\u0441\u0438\u0435 \u0432 \u043a\u0430\u043d\u0430\u043b\u0435"}</strong><span>{marketingConsents.find((consent) => consent.channel === selected.channel)?.status ?? "\u043d\u0435\u0442 \u0437\u0430\u043f\u0438\u0441\u0438"}</span><button className="danger-action" onClick={withdrawMarketingConsent} type="button">{"\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c \u0441\u043e\u0433\u043b\u0430\u0441\u0438\u0435"}</button><small>{"\u041e\u0442\u0437\u044b\u0432 \u0432\u044b\u043f\u043e\u043b\u043d\u044f\u0435\u0442\u0441\u044f \u0432\u0440\u0443\u0447\u043d\u0443\u044e \u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u0442\u0441\u044f \u0432 \u0436\u0443\u0440\u043d\u0430\u043b\u0435."}</small></div>
            <div className="client-channel-restrictions">
              <div className="client-channel-restrictions-head">
                <span className="client-channel-restrictions-icon"><Ban size={17} /></span>
                <span><strong>Запрет коммуникаций</strong><small>Запрет имеет приоритет над согласием и настройкой рассылок без согласия.</small></span>
              </div>
              <div className="client-channel-restriction-list">
                {(marketingChannels.length ? marketingChannels : [selected.channel]).map((channel) => {
                  const normalizedChannel = String(channel).toLowerCase();
                  const blocked = marketingRestrictions.some((restriction) => restriction.blocked && String(restriction.channel).toLowerCase() === normalizedChannel);
                  const saving = restrictionSavingChannel === normalizedChannel;
                  return (
                    <label className={`client-channel-restriction ${blocked ? "blocked" : ""}`} key={normalizedChannel}>
                      <span className="client-channel-restriction-state">{saving ? <LoaderCircle className="spin" size={16} /> : blocked ? <Ban size={16} /> : <CheckCircle2 size={16} />}</span>
                      <span><strong>{channel}</strong><small>{blocked ? "Рассылки запрещены" : "Рассылки разрешены"}</small></span>
                      <span className="client-restriction-switch"><input checked={blocked} disabled={Boolean(restrictionSavingChannel)} onChange={(event) => void toggleChannelRestriction(channel, event.target.checked)} type="checkbox" /><i aria-hidden="true" /></span>
                    </label>
                  );
                })}
              </div>
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
                  <article className={`duplicate-row ${isMerged ? "merged" : ""}`} key={candidate.clientIdentityKey}>
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
            <SectionTitle title="История обращений" action={`${selected.appealCount} обращений`} />
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
