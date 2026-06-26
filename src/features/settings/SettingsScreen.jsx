import React, { useMemo, useState } from "react";
import {
  KeyRound,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  ToggleLeft,
  ToggleRight,
  Zap
} from "lucide-react";
import { ChannelBadge, ChannelList, Permission, ProductScreen, SectionTitle, SegmentedControl, ToolbarSearch } from "../../ui.jsx";
import {
  activeSecuritySessions,
  apiChangelog,
  apiEnvironmentKeys,
  channelDetails,
  channelSettings,
  employeeChannelRules,
  employeeGroups,
  roles,
  securityAlerts,
  securityControls,
  sdkEvents,
  topicDirectorySeed,
  webhookDeliveryLog,
  webhookEndpoints
} from "../../data.js";
import { createScreenStateItems } from "../../app/screenState.js";

const topicStatusFilters = ["Все", "Активные", "Архив"];
export function SettingsScreen({ onBack, onToast, access, roleMode, onRoleMode }) {
  const [channels, setChannels] = useState(channelSettings);
  const [topicDirectory, setTopicDirectory] = useState(topicDirectorySeed);
  const [topicQuery, setTopicQuery] = useState("");
  const [topicStatusFilter, setTopicStatusFilter] = useState("Все");
  const [selectedChannelId, setSelectedChannelId] = useState(channelDetails[0].id);
  const [channelLogSeverity, setChannelLogSeverity] = useState("all");
  const [channelLogConnection, setChannelLogConnection] = useState("all");
  const [channelTestMode, setChannelTestMode] = useState("receive");
  const [channelTestRecipient, setChannelTestRecipient] = useState("+7 999 000-00-00");
  const [channelTestMessage, setChannelTestMessage] = useState("Тестовое сообщение из панели канала");
  const [channelTestResult, setChannelTestResult] = useState(null);
  const [employeeRules, setEmployeeRules] = useState(employeeChannelRules);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employeeChannelRules[0].id);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [sdkPlaygroundEvent, setSdkPlaygroundEvent] = useState(sdkEvents[0][0]);
  const [sdkPlaygroundEnv, setSdkPlaygroundEnv] = useState("production");
  const [sdkPlaygroundChannel, setSdkPlaygroundChannel] = useState("SDK");
  const [sdkPlaygroundUser, setSdkPlaygroundUser] = useState("gig-olga-0940");
  const [sdkPlaygroundPhone, setSdkPlaygroundPhone] = useState("+7 985 430-09-40");
  const [sdkPlaygroundMessage, setSdkPlaygroundMessage] = useState("Здравствуйте, проверяем запуск диалога из SDK.");
  const [sdkPlaygroundResult, setSdkPlaygroundResult] = useState(null);
  const [selectedWebhookId, setSelectedWebhookId] = useState(webhookEndpoints[0].id);
  const [rotatedKeyIds, setRotatedKeyIds] = useState([]);
  const [replayedDeliveryIds, setReplayedDeliveryIds] = useState([]);
  const [revokedSessionIds, setRevokedSessionIds] = useState([]);
  const canEditSettings = access.canManageSettings;
  const canEditEmployeeDirectory = canEditSettings;
  const canResetEmployeePassword = canEditSettings || roleMode === "Старший сотрудник";
  const normalizedTopicQuery = topicQuery.trim().toLowerCase();
  const selectedChannel = channelDetails.find((channel) => channel.id === selectedChannelId) ?? channelDetails[0];
  const selectedEmployee = employeeRules.find((employee) => employee.id === selectedEmployeeId) ?? employeeRules[0];
  const selectedWebhook = webhookEndpoints.find((endpoint) => endpoint.id === selectedWebhookId) ?? webhookEndpoints[0];
  const visibleWebhookDeliveries = webhookDeliveryLog.filter((entry) => entry.endpointId === selectedWebhook.id);

  const topicTotals = useMemo(() => {
    return topicDirectory.reduce((totals, group) => {
      group.branches.forEach((branch) => {
        branch.children.forEach((topic) => {
          totals.total += 1;
          if (topic.archived) {
            totals.archived += 1;
          } else {
            totals.active += 1;
          }
        });
      });
      return totals;
    }, { active: 0, archived: 0, total: 0 });
  }, [topicDirectory]);

  const visibleTopicDirectory = useMemo(() => {
    function statusMatches(topic) {
      if (topicStatusFilter === "Активные") {
        return !topic.archived;
      }
      if (topicStatusFilter === "Архив") {
        return topic.archived;
      }
      return true;
    }

    return topicDirectory.map((group) => {
      const branches = group.branches.map((branch) => {
        const branchMatches = [group.name, group.owner, group.description, branch.name].join(" ").toLowerCase().includes(normalizedTopicQuery);
        const children = branch.children.filter((topic) => {
          const haystack = [
            group.name,
            group.owner,
            group.description,
            branch.name,
            topic.name,
            topic.routing,
            topic.access,
            ...topic.channels
          ].join(" ").toLowerCase();
          return statusMatches(topic) && (!normalizedTopicQuery || branchMatches || haystack.includes(normalizedTopicQuery));
        });
        return { ...branch, children };
      }).filter((branch) => branch.children.length > 0);

      if (!branches.length) {
        return null;
      }

      return { ...group, branches };
    }).filter(Boolean);
  }, [normalizedTopicQuery, topicDirectory, topicStatusFilter]);

  const visibleChannelLogs = useMemo(() => {
    return selectedChannel.logs.filter((log) => {
      const severityMatches = channelLogSeverity === "all" || log.severity === channelLogSeverity;
      const connectionMatches = channelLogConnection === "all" || log.connectionId === channelLogConnection;
      return severityMatches && connectionMatches;
    });
  }, [channelLogConnection, channelLogSeverity, selectedChannel]);

  const visibleEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    if (!query) {
      return employeeRules;
    }

    return employeeRules.filter((employee) => [
      employee.employee,
      employee.role,
      employee.group,
      employee.passwordStatus,
      ...employee.channels
    ].join(" ").toLowerCase().includes(query));
  }, [employeeQuery, employeeRules]);

  const sdkPayloadPreview = useMemo(() => {
    const base = {
      appId: sdkPlaygroundEnv === "production" ? "gig-app-prod" : "gig-app-stage",
      event: sdkPlaygroundEvent,
      channel: sdkPlaygroundChannel,
      userId: sdkPlaygroundUser,
      timestamp: "2026-06-26T12:00:00+03:00"
    };

    if (sdkPlaygroundEvent === "identifyUser") {
      return {
        ...base,
        payload: {
          phone: sdkPlaygroundPhone,
          device: sdkPlaygroundChannel === "SDK" ? "iOS 17" : "external",
          entryPoint: sdkPlaygroundChannel
        }
      };
    }

    if (sdkPlaygroundEvent === "initConversation") {
      return {
        ...base,
        payload: {
          phone: sdkPlaygroundPhone,
          topic: "Оплата / Возврат",
          message: sdkPlaygroundMessage,
          operatorId: "auto"
        }
      };
    }

    if (sdkPlaygroundEvent === "trackEntryPoint") {
      return {
        ...base,
        payload: {
          source: sdkPlaygroundChannel,
          screen: "order_status",
          utm: "support_entry"
        }
      };
    }

    return {
      ...base,
      payload: {
        topic: "Оплата / Возврат",
        requiredForClose: true,
        source: sdkPlaygroundChannel
      }
    };
  }, [sdkPlaygroundChannel, sdkPlaygroundEnv, sdkPlaygroundEvent, sdkPlaygroundMessage, sdkPlaygroundPhone, sdkPlaygroundUser]);

  function toggleChannel(name) {
    setChannels((current) => current.map((channel) => channel.name === name ? { ...channel, enabled: !channel.enabled } : channel));
  }

  function updateLimit(name, limit) {
    setChannels((current) => current.map((channel) => channel.name === name ? { ...channel, limit } : channel));
  }

  function updateSelectedEmployee(field, value) {
    if (!canEditEmployeeDirectory) {
      return;
    }

    setEmployeeRules((current) => current.map((employee) => employee.id === selectedEmployee.id ? { ...employee, [field]: value } : employee));
  }

  function toggleSelectedEmployeeChannel(channelName) {
    if (!canEditEmployeeDirectory) {
      return;
    }

    setEmployeeRules((current) => current.map((employee) => {
      if (employee.id !== selectedEmployee.id) {
        return employee;
      }

      const channels = employee.channels.includes(channelName)
        ? employee.channels.filter((channel) => channel !== channelName)
        : [...employee.channels, channelName];
      return { ...employee, channels };
    }));
  }

  function handlePasswordReset(employeeName) {
    if (!canResetEmployeePassword) {
      return;
    }

    setEmployeeRules((current) => current.map((employee) => employee.employee === employeeName
      ? { ...employee, passwordStatus: "Сброс отправлен" }
      : employee
    ));
    onToast(`${employeeName}: ссылка для смены пароля отправлена и попадет в audit.`);
  }

  function handleTopicArchive(groupId, branchId, topicId) {
    if (!canEditSettings) {
      return;
    }

    let toastMessage = "";
    const nextDirectory = topicDirectory.map((group) => {
      if (group.id !== groupId) {
        return group;
      }

      return {
        ...group,
        branches: group.branches.map((branch) => {
          if (branch.id !== branchId) {
            return branch;
          }

          return {
            ...branch,
            children: branch.children.map((topic) => {
              if (topic.id !== topicId) {
                return topic;
              }

              const archived = !topic.archived;
              toastMessage = `${group.name} / ${topic.name}: ${archived ? "перемещена в архив" : "восстановлена"}. Audit-событие подготовлено.`;
              return { ...topic, archived };
            })
          };
        })
      };
    });

    setTopicDirectory(nextDirectory);
    if (toastMessage) {
      onToast(toastMessage);
    }
  }

  function handleTopicEdit(groupName, topicName) {
    onToast(canEditSettings ? `${groupName} / ${topicName}: карточка редактирования открыта.` : access.reason);
  }

  function handleChannelSelect(channelId) {
    setSelectedChannelId(channelId);
    setChannelLogSeverity("all");
    setChannelLogConnection("all");
    setChannelTestResult(null);
  }

  function handleChannelTest() {
    if (!canEditSettings) {
      return;
    }

    const message = channelTestMessage.trim();
    const recipient = channelTestRecipient.trim();
    if (!recipient || !message) {
      setChannelTestResult({
        tone: "error",
        title: "Заполните адресата и сообщение",
        raw: "{ \"ok\": false, \"error\": \"recipient_and_message_required\" }"
      });
      return;
    }

    const raw = {
      ok: true,
      channel: selectedChannel.channel,
      direction: channelTestMode,
      connection: selectedChannel.connections[0].rawId,
      recipient,
      requestId: `test_${selectedChannel.id}_${Date.now().toString().slice(-5)}`,
      status: channelTestMode === "receive" ? "accepted_to_queue" : "sent_to_channel"
    };
    setChannelTestResult({
      tone: "success",
      title: channelTestMode === "receive" ? "Входящее тестовое сообщение принято" : "Исходящее тестовое сообщение отправлено",
      raw: JSON.stringify(raw, null, 2)
    });
    onToast(`${selectedChannel.channel}: тест ${channelTestMode === "receive" ? "приема" : "отправки"} выполнен.`);
  }

  function handleSdkPlaygroundRun() {
    if (!canEditSettings) {
      return;
    }

    const requiresPhone = ["identifyUser", "initConversation"].includes(sdkPlaygroundEvent);
    const requiresMessage = sdkPlaygroundEvent === "initConversation";
    if ((requiresPhone && !sdkPlaygroundPhone.trim()) || (requiresMessage && !sdkPlaygroundMessage.trim())) {
      setSdkPlaygroundResult({
        tone: "error",
        title: "Payload не прошел валидацию",
        response: "{ \"ok\": false, \"error\": \"phone_or_message_required\" }"
      });
      return;
    }

    const response = {
      ok: true,
      event: sdkPlaygroundEvent,
      environment: sdkPlaygroundEnv,
      requestId: `sdk_${sdkPlaygroundEvent}_${Date.now().toString().slice(-5)}`,
      acceptedAt: "2026-06-26T12:00:02+03:00",
      route: sdkPlaygroundEvent === "initConversation" ? "outbound_queue" : "event_stream"
    };
    setSdkPlaygroundResult({
      tone: "success",
      title: "Payload принят тестовым стендом",
      response: JSON.stringify(response, null, 2)
    });
    onToast(`SDK playground: ${sdkPlaygroundEvent} выполнен в ${sdkPlaygroundEnv}.`);
  }

  function handleRotateApiKey(keyId) {
    if (!canEditSettings) {
      return;
    }

    setRotatedKeyIds((current) => current.includes(keyId) ? current : [...current, keyId]);
    onToast(`${keyId}: ключ поставлен на ротацию, audit event подготовлен.`);
  }

  function handleReplayWebhook(delivery) {
    if (!canEditSettings) {
      return;
    }

    setReplayedDeliveryIds((current) => current.includes(delivery.id) ? current : [...current, delivery.id]);
    onToast(`${delivery.traceId}: manual replay поставлен в очередь.`);
  }

  function handleRevokeSession(sessionId) {
    if (!canEditSettings) {
      return;
    }

    setRevokedSessionIds((current) => current.includes(sessionId) ? current : [...current, sessionId]);
    onToast(`${sessionId}: сессия отозвана и попадет в security audit.`);
  }

  return (
    <ProductScreen
      title="Настройки"
      subtitle="Права, каналы, лимиты операторов, маршрутизация и обязательные правила закрытия."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: channels.length,
        empty: `${channels.length} каналов`,
        emptyWhenZero: "каналы не настроены",
        errors: channelDetails.flatMap((channel) => channel.logs).filter((log) => log.severity === "error").length,
        errorLabel: "критичных ошибок нет"
      })}
      actions={
        <button className="primary-action" disabled={!canEditSettings} onClick={() => onToast("Настройки сохранены и попадут в аудит.")}>
          <ShieldCheck size={17} />
          Сохранить
        </button>
      }
    >
      <div className="role-mode-panel">
        <div>
          <strong>Проверка интерфейса по роли</strong>
          <span>{canEditSettings ? "Полный доступ к общим настройкам" : "Общие настройки доступны только на чтение"}</span>
        </div>
        <SegmentedControl
          ariaLabel="Текущая роль"
          options={["Сотрудник", "Старший сотрудник", "Администратор"]}
          value={roleMode}
          onChange={onRoleMode}
        />
      </div>

      <div className="settings-layout">
        <section className="work-panel">
          <SectionTitle title="Матрица ролей" action="Серверная проверка прав" />
          <div className="role-table">
            <div className="role-head">
              <span>Роль</span>
              <span>Панель</span>
              <span>Настройки</span>
              <span>Пароли</span>
              <span>Отчеты</span>
            </div>
            {roles.map((role) => (
              <div className="role-row" key={role.name}>
                <strong>{role.name}</strong>
                <Permission enabled={role.panel} />
                <Permission enabled={role.settings} />
                <Permission enabled={role.reset} />
                <span>{role.reports}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="Каналы и лимиты" action="На одного оператора" />
          <div className="channel-settings">
            {channels.map((channel) => (
              <article key={channel.name}>
                <button
                  aria-label={`Переключить ${channel.name}`}
                  aria-pressed={channel.enabled}
                  className="toggle-button"
                  disabled={!canEditSettings}
                  onClick={() => toggleChannel(channel.name)}
                  title={`Переключить ${channel.name}`}
                  type="button"
                >
                  {channel.enabled ? <ToggleRight size={34} /> : <ToggleLeft size={34} />}
                </button>
                <ChannelBadge channel={channel.name} />
                <span>{channel.staff} сотрудников</span>
                <label>
                  <span>Лимит</span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={channel.limit}
                    disabled={!canEditSettings}
                    onChange={(event) => updateLimit(channel.name, Number(event.target.value))}
                  />
                </label>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="work-panel employee-rules-panel">
        <SectionTitle title="Каналы и лимиты по сотрудникам" action="исключения и маскирование данных" />
        <div className="employee-management">
          <div className="employee-directory">
            <ToolbarSearch
              ariaLabel="Поиск сотрудника"
              className="employee-search"
              iconSize={17}
              placeholder="Сотрудник, роль, группа, канал"
              value={employeeQuery}
              onChange={setEmployeeQuery}
            />
            <div className="employee-selector-list">
              {visibleEmployees.map((employee) => (
                <button
                  aria-pressed={selectedEmployee.id === employee.id}
                  className={selectedEmployee.id === employee.id ? "selected" : ""}
                  data-employee-id={employee.id}
                  key={employee.id}
                  onClick={() => setSelectedEmployeeId(employee.id)}
                  type="button"
                >
                  <strong>{employee.employee}</strong>
                  <span>{employee.role} · {employee.group}</span>
                  <ChannelList channels={employee.channels} />
                </button>
              ))}
              {!visibleEmployees.length ? (
                <div className="employee-empty">Сотрудники не найдены.</div>
              ) : null}
            </div>
          </div>

          <div className="employee-editor">
            <header>
              <div>
                <strong>{selectedEmployee.employee}</strong>
                <span>{selectedEmployee.role} · {selectedEmployee.lastLogin}</span>
              </div>
              <button
                disabled={!canResetEmployeePassword}
                onClick={() => handlePasswordReset(selectedEmployee.employee)}
                title={canResetEmployeePassword ? "Сбросить пароль сотруднику" : access.reason}
                type="button"
              >
                <KeyRound size={16} />
                Сбросить пароль
              </button>
            </header>
            <div className="employee-editor-grid">
              <label>
                <span>Роль</span>
                <select disabled={!canEditEmployeeDirectory} value={selectedEmployee.role} onChange={(event) => updateSelectedEmployee("role", event.target.value)} title={canEditEmployeeDirectory ? "Изменить роль" : access.reason}>
                  {["Сотрудник", "Старший сотрудник", "Администратор"].map((role) => <option key={role}>{role}</option>)}
                </select>
              </label>
              <label>
                <span>Группа</span>
                <select disabled={!canEditEmployeeDirectory} value={selectedEmployee.group} onChange={(event) => updateSelectedEmployee("group", event.target.value)} title={canEditEmployeeDirectory ? "Назначить группу" : access.reason}>
                  {employeeGroups.map((group) => <option value={group.name} key={group.id}>{group.name}</option>)}
                </select>
              </label>
              <label>
                <span>Лимит чатов</span>
                <input disabled={!canEditEmployeeDirectory} min="1" max="30" type="number" value={selectedEmployee.chatLimit} onChange={(event) => updateSelectedEmployee("chatLimit", Number(event.target.value))} title={canEditEmployeeDirectory ? "Изменить лимит сотрудника" : access.reason} />
              </label>
              <div>
                <span>Пароль</span>
                <strong>{selectedEmployee.passwordStatus}</strong>
              </div>
            </div>
            <div className="employee-channel-editor" aria-label="Каналы сотрудника">
              {["SDK", "Telegram", "MAX", "VK"].map((channelName) => (
                <label key={channelName}>
                  <input
                    checked={selectedEmployee.channels.includes(channelName)}
                    disabled={!canEditEmployeeDirectory}
                    onChange={() => toggleSelectedEmployeeChannel(channelName)}
                    title={canEditEmployeeDirectory ? `Переключить канал ${channelName}` : access.reason}
                    type="checkbox"
                  />
                  <ChannelBadge channel={channelName} />
                </label>
              ))}
            </div>
            <div className="employee-permission-toggles">
              <label>
                <input
                  checked={selectedEmployee.canOverride}
                  disabled={!canEditEmployeeDirectory}
                  onChange={(event) => updateSelectedEmployee("canOverride", event.target.checked)}
                  title={canEditEmployeeDirectory ? "Разрешить override" : access.reason}
                  type="checkbox"
                />
                <span>Override очереди</span>
              </label>
              <label>
                <input
                  checked={selectedEmployee.sensitiveData}
                  disabled={!canEditEmployeeDirectory}
                  onChange={(event) => updateSelectedEmployee("sensitiveData", event.target.checked)}
                  title={canEditEmployeeDirectory ? "Показывать чувствительные данные" : access.reason}
                  type="checkbox"
                />
                <span>Чувствительные данные</span>
              </label>
            </div>
            <footer>
              <span>{canEditEmployeeDirectory ? "Изменения попадут в audit после сохранения." : `${roleMode}: можно смотреть карточку сотрудника${canResetEmployeePassword ? " и сбрасывать пароль." : "."}`}</span>
              <button
                disabled={!canEditEmployeeDirectory}
                onClick={() => onToast(`${selectedEmployee.employee}: настройки сотрудника сохранены.`)}
                title={canEditEmployeeDirectory ? "Сохранить сотрудника" : access.reason}
                type="button"
              >
                <ShieldCheck size={16} />
                Сохранить
              </button>
            </footer>
          </div>
        </div>
        <div className="employee-group-strip" aria-label="Группы сотрудников">
          {employeeGroups.map((group) => (
            <div key={group.id}>
              <strong>{group.name}</strong>
              <span>{group.members} сотрудников · {group.scope}</span>
            </div>
          ))}
        </div>
        <div className="employee-rule-list">
          {employeeRules.map((rule) => (
            <article className="employee-rule" key={rule.id}>
              <header>
                <strong>{rule.employee}</strong>
                <span>{rule.role} · {rule.group}</span>
                <b>{rule.chatLimit} чатов</b>
              </header>
              <ChannelList channels={rule.channels} />
              <p>{rule.exceptions.join("; ")}</p>
              <footer>
                <span>{rule.canOverride ? "может override" : "без override"}</span>
                <span>{rule.sensitiveData ? "видит чувствительные данные" : "данные маскированы"}</span>
                <span>{rule.passwordStatus}</span>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="work-panel topic-directory-panel">
        <SectionTitle title="Справочник тематик" action={`${topicTotals.active} активных / ${topicTotals.archived} архив`} />
        <div className="topic-directory-toolbar">
          <ToolbarSearch
            ariaLabel="Поиск по справочнику тематик"
            className="topic-search"
            iconSize={17}
            placeholder="Поиск по теме, каналу, владельцу"
            value={topicQuery}
            onChange={setTopicQuery}
          />
          <SegmentedControl
            ariaLabel="Статус тематики"
            className="topic-filter"
            options={topicStatusFilters}
            value={topicStatusFilter}
            onChange={setTopicStatusFilter}
          />
          <button
            className="topic-add-button"
            disabled={!canEditSettings}
            onClick={() => onToast("Новая тематика: карточка создания открыта.")}
            title={canEditSettings ? "Добавить тематику" : access.reason}
            type="button"
          >
            <Plus size={16} />
            Добавить
          </button>
        </div>
        <div className="topic-rights-note">
          <ShieldCheck size={17} />
          <span>{canEditSettings ? "Администратор может создавать, редактировать, архивировать и восстанавливать тематики." : `${roleMode}: просмотр справочника без изменения общих настроек.`}</span>
        </div>
        <div className="topic-tree-list">
          {visibleTopicDirectory.map((group) => (
            <article className="topic-group" key={group.id}>
              <header>
                <div>
                  <strong>{group.name}</strong>
                  <span>{group.description}</span>
                </div>
                <div className="topic-group-meta">
                  <span>{group.owner}</span>
                  <b>{group.branches.reduce((sum, branch) => sum + branch.children.length, 0)} тем</b>
                </div>
              </header>
              {group.branches.map((branch) => (
                <div className="topic-branch" key={branch.id}>
                  <div className="topic-branch-title">
                    <span>{branch.name}</span>
                    <small>{branch.children.length} видимых</small>
                  </div>
                  <div className="topic-row-list">
                    {branch.children.map((topic) => (
                      <div className={`topic-row ${topic.archived ? "archived" : ""}`} data-topic-id={topic.id} key={topic.id}>
                        <div className="topic-path">
                          <Tag size={16} />
                          <div>
                            <strong>{topic.name}</strong>
                            <span>{group.name} / {branch.name} / {topic.name}</span>
                          </div>
                        </div>
                        <ChannelList channels={topic.channels} />
                        <div className="topic-state">
                          <span className={topic.archived ? "archived" : "active"}>{topic.archived ? "Архив" : "Активна"}</span>
                          <small>{topic.required ? "обязательная" : "необязательная"}</small>
                        </div>
                        <div className="topic-routing">
                          <strong>{topic.routing}</strong>
                          <span>{topic.access}</span>
                        </div>
                        <div className="topic-actions">
                          <button
                            aria-label={`Редактировать: ${group.name} / ${topic.name}`}
                            data-topic-action="edit"
                            disabled={!canEditSettings}
                            onClick={() => handleTopicEdit(group.name, topic.name)}
                            title={canEditSettings ? "Редактировать тематику" : access.reason}
                            type="button"
                          >
                            <Pencil size={15} />
                            Редактировать
                          </button>
                          <button
                            aria-label={`${topic.archived ? "Вернуть" : "В архив"}: ${group.name} / ${topic.name}`}
                            aria-pressed={topic.archived}
                            data-topic-action="archive"
                            disabled={!canEditSettings}
                            onClick={() => handleTopicArchive(group.id, branch.id, topic.id)}
                            title={canEditSettings ? (topic.archived ? "Вернуть тематику из архива" : "Переместить тематику в архив") : access.reason}
                            type="button"
                          >
                            {topic.archived ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                            {topic.archived ? "Вернуть" : "В архив"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </article>
          ))}
          {!visibleTopicDirectory.length && (
            <div className="topic-empty">
              <Search size={18} />
              <strong>Тематики не найдены</strong>
              <span>Измените запрос или фильтр статуса.</span>
            </div>
          )}
        </div>
      </section>

      <div className="integration-layout">
        <section className="work-panel channel-connections-panel">
          <SectionTitle title="Подключения" action={`${selectedChannel.channel}: детализация канала`} />
          <div className="integration-cards channel-card-list">
            {channelDetails.map((integration) => (
              <button
                aria-pressed={selectedChannelId === integration.id}
                className={`integration-card channel-card ${selectedChannelId === integration.id ? "selected" : ""}`}
                data-channel-card={integration.id}
                key={integration.id}
                onClick={() => handleChannelSelect(integration.id)}
                type="button"
              >
                <header>
                  <ChannelBadge channel={integration.channel} />
                  <strong>{integration.name}</strong>
                  <span>{integration.status}</span>
                </header>
                <p>{integration.detail}</p>
                <div className="health-bar"><i style={{ width: `${integration.health}%` }} /></div>
                <footer>
                  <span>{integration.health}% health</span>
                  <b>{integration.connections.length} подключения</b>
                </footer>
              </button>
            ))}
          </div>
          <div className="channel-detail-surface">
            <header className="channel-detail-head">
              <div>
                <ChannelBadge channel={selectedChannel.channel} />
                <strong>{selectedChannel.name}</strong>
                <span>{selectedChannel.status} · синхронизация {selectedChannel.lastSync}</span>
              </div>
              <button
                disabled={!canEditSettings}
                onClick={() => onToast(`${selectedChannel.name}: проверка подключения запущена.`)}
                title={canEditSettings ? "Проверить канал" : access.reason}
                type="button"
              >
                <PlayCircle size={16} />
                Проверить канал
              </button>
            </header>
            <div className="channel-detail-grid">
              <div>
                <span>Raw ID</span>
                <strong>{selectedChannel.rawId}</strong>
              </div>
              <div>
                <span>Маршрутизация</span>
                <strong>{selectedChannel.route}</strong>
              </div>
              <div>
                <span>Лимит</span>
                <strong>{selectedChannel.limit}</strong>
              </div>
              <div>
                <span>Сотрудники</span>
                <strong>{selectedChannel.employees}</strong>
              </div>
            </div>
            <div className="channel-group-list" aria-label="Группы канала">
              {selectedChannel.groups.map((group) => <span key={group}>{group}</span>)}
            </div>

            <div className="channel-detail-section">
              <div className="section-title compact-title">
                <h3>Подключения канала</h3>
                <span>несколько инстансов</span>
              </div>
              <div className="connection-list">
                {selectedChannel.connections.map((connection) => (
                  <div className={`connection-row ${connection.status.toLowerCase()}`} key={connection.id}>
                    <div>
                      <strong>{connection.name}</strong>
                      <span>{connection.env} · {connection.rawId}</span>
                    </div>
                    <b>{connection.status}</b>
                    <span>{connection.lastEvent}</span>
                    <span>{connection.traffic}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="channel-detail-section">
              <div className="channel-log-toolbar">
                <div className="section-title compact-title">
                  <h3>Журнал ошибок и событий</h3>
                  <span>{visibleChannelLogs.length} событий</span>
                </div>
                <select value={channelLogConnection} onChange={(event) => setChannelLogConnection(event.target.value)} aria-label="Фильтр логов по подключению">
                  <option value="all">Все подключения</option>
                  {selectedChannel.connections.map((connection) => <option value={connection.id} key={connection.id}>{connection.name}</option>)}
                </select>
                <select value={channelLogSeverity} onChange={(event) => setChannelLogSeverity(event.target.value)} aria-label="Фильтр логов по уровню">
                  <option value="all">Все уровни</option>
                  <option value="info">Info</option>
                  <option value="warn">Warn</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <div className="channel-log-list">
                {visibleChannelLogs.map((log) => (
                  <div className={`channel-log-row ${log.severity}`} key={log.id}>
                    <time>{log.time}</time>
                    <b>{log.severity}</b>
                    <span>{selectedChannel.connections.find((connection) => connection.id === log.connectionId)?.name ?? log.connectionId}</span>
                    <strong>{log.message}</strong>
                    <code>{log.traceId}</code>
                  </div>
                ))}
                {!visibleChannelLogs.length ? (
                  <div className="channel-log-empty">По выбранным фильтрам событий нет.</div>
                ) : null}
              </div>
            </div>

            <div className="channel-test-panel">
              <div className="section-title compact-title">
                <h3>Тест приема/отправки</h3>
                <span>{canEditSettings ? "симуляция raw response" : "только администратор"}</span>
              </div>
              <div className="channel-test-grid">
                <label>
                  <span>Направление</span>
                  <select disabled={!canEditSettings} value={channelTestMode} onChange={(event) => setChannelTestMode(event.target.value)} title={canEditSettings ? "Выберите режим теста" : access.reason}>
                    <option value="receive">Прием</option>
                    <option value="send">Отправка</option>
                  </select>
                </label>
                <label>
                  <span>Адресат / тестовый пользователь</span>
                  <input disabled={!canEditSettings} value={channelTestRecipient} onChange={(event) => setChannelTestRecipient(event.target.value)} title={canEditSettings ? "Тестовый адресат" : access.reason} />
                </label>
                <label className="channel-test-message">
                  <span>Сообщение / payload</span>
                  <textarea disabled={!canEditSettings} value={channelTestMessage} onChange={(event) => setChannelTestMessage(event.target.value)} title={canEditSettings ? "Тестовое сообщение" : access.reason} />
                </label>
                <button disabled={!canEditSettings} onClick={handleChannelTest} title={canEditSettings ? "Запустить тест" : access.reason} type="button">
                  <PlayCircle size={16} />
                  Запустить тест
                </button>
              </div>
              {channelTestResult ? (
                <div className={`channel-test-result ${channelTestResult.tone}`}>
                  <strong>{channelTestResult.title}</strong>
                  <code>{channelTestResult.raw}</code>
                </div>
              ) : (
                <div className="channel-test-empty">Результат теста появится после запуска.</div>
              )}
            </div>
          </div>
        </section>

        <section className="work-panel sdk-console">
          <SectionTitle title="SDK-консоль" action="Ключи, события, точки входа" />
          <div className="sdk-code">
            <code>{`SupportSDK.init({ appId: "gig-app", channels: ["SDK", "Telegram", "MAX", "VK"] })`}</code>
            <button disabled={!canEditSettings} onClick={() => onToast("SDK snippet скопирован.")} title={canEditSettings ? "Копировать SDK snippet" : access.reason} type="button">Копировать</button>
          </div>
          <div className="sdk-playground">
            <div className="section-title compact-title">
              <h3>Playground payload</h3>
              <span>{canEditSettings ? "raw preview и тестовый стенд" : "только администратор"}</span>
            </div>
            <div className="sdk-playground-grid">
              <label>
                <span>Событие</span>
                <select disabled={!canEditSettings} value={sdkPlaygroundEvent} onChange={(event) => setSdkPlaygroundEvent(event.target.value)} title={canEditSettings ? "Выберите SDK событие" : access.reason}>
                  {sdkEvents.map(([event]) => <option value={event} key={event}>{event}</option>)}
                </select>
              </label>
              <label>
                <span>Окружение</span>
                <select disabled={!canEditSettings} value={sdkPlaygroundEnv} onChange={(event) => setSdkPlaygroundEnv(event.target.value)} title={canEditSettings ? "Выберите окружение" : access.reason}>
                  <option value="production">production</option>
                  <option value="stage">stage</option>
                </select>
              </label>
              <label>
                <span>Канал</span>
                <select disabled={!canEditSettings} value={sdkPlaygroundChannel} onChange={(event) => setSdkPlaygroundChannel(event.target.value)} title={canEditSettings ? "Выберите канал" : access.reason}>
                  {["SDK", "Telegram", "MAX", "VK"].map((channel) => <option value={channel} key={channel}>{channel}</option>)}
                </select>
              </label>
              <label>
                <span>User ID</span>
                <input disabled={!canEditSettings} value={sdkPlaygroundUser} onChange={(event) => setSdkPlaygroundUser(event.target.value)} title={canEditSettings ? "ID гигера" : access.reason} />
              </label>
              <label>
                <span>Телефон</span>
                <input disabled={!canEditSettings} value={sdkPlaygroundPhone} onChange={(event) => setSdkPlaygroundPhone(event.target.value)} title={canEditSettings ? "Телефон гигера" : access.reason} />
              </label>
              <label className="sdk-message-field">
                <span>Сообщение</span>
                <textarea disabled={!canEditSettings} value={sdkPlaygroundMessage} onChange={(event) => setSdkPlaygroundMessage(event.target.value)} title={canEditSettings ? "Текст стартового сообщения" : access.reason} />
              </label>
            </div>
            <div className="sdk-payload-preview">
              <div>
                <strong>Raw payload</strong>
                <code>{JSON.stringify(sdkPayloadPreview, null, 2)}</code>
              </div>
              <div>
                <strong>Response</strong>
                {sdkPlaygroundResult ? (
                  <code className={sdkPlaygroundResult.tone}>{sdkPlaygroundResult.response}</code>
                ) : (
                  <span>Запустите событие, чтобы увидеть ответ тестового стенда.</span>
                )}
              </div>
            </div>
            <div className="sdk-playground-actions">
              {sdkPlaygroundResult ? <span className={sdkPlaygroundResult.tone}>{sdkPlaygroundResult.title}</span> : <span>Payload обновляется при изменении полей.</span>}
              <button disabled={!canEditSettings} onClick={handleSdkPlaygroundRun} title={canEditSettings ? "Запустить SDK событие" : access.reason} type="button">
                <PlayCircle size={16} />
                Запустить событие
              </button>
            </div>
          </div>
          <div className="sdk-event-list">
            {sdkEvents.map(([event, description]) => (
              <div className="sdk-event-row" key={event}>
                <Zap size={17} />
                <strong>{event}</strong>
                <span>{description}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {canEditSettings ? (
      <div className="admin-workspace-layout">
        <section className="work-panel api-governance-panel">
          <SectionTitle title="Webhooks / API keys" action="signed delivery, replay, changelog" />
          <div className="api-key-grid">
            {apiEnvironmentKeys.map((key) => {
              const isRotated = rotatedKeyIds.includes(key.id);

              return (
                <article className={`api-key-card ${isRotated ? "rotated" : ""}`} key={key.id}>
                  <header>
                    <span>{key.env}</span>
                    <strong>{key.name}</strong>
                    <b>{isRotated ? "Rotation queued" : key.status}</b>
                  </header>
                  <code>{key.keyPreview}</code>
                  <p>{key.protection}</p>
                  <footer>
                    <small>{key.scopes.join(", ")}</small>
                    <button disabled={!canEditSettings} onClick={() => handleRotateApiKey(key.id)} title={canEditSettings ? "Поставить ключ на ротацию" : access.reason} type="button">
                      Rotate key
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>

          <div className="webhook-workspace">
            <div className="webhook-endpoint-list">
              {webhookEndpoints.map((endpoint) => (
                <button
                  aria-pressed={selectedWebhook.id === endpoint.id}
                  className={`webhook-endpoint ${selectedWebhook.id === endpoint.id ? "selected" : ""}`}
                  key={endpoint.id}
                  onClick={() => setSelectedWebhookId(endpoint.id)}
                  type="button"
                >
                  <ChannelBadge channel={endpoint.channel} />
                  <span>
                    <strong>{endpoint.name}</strong>
                    <small>{endpoint.status} · {endpoint.failureRate} failures</small>
                  </span>
                </button>
              ))}
            </div>

            <div className="webhook-detail">
              <header>
                <div>
                  <strong>{selectedWebhook.name}</strong>
                  <span>{selectedWebhook.url}</span>
                </div>
                <b>{selectedWebhook.signature}</b>
              </header>
              <div className="webhook-meta-grid">
                <div><span>Retries</span><strong>{selectedWebhook.retries}</strong></div>
                <div><span>Last delivery</span><strong>{selectedWebhook.lastDelivery}</strong></div>
                <div><span>Failure rate</span><strong>{selectedWebhook.failureRate}</strong></div>
              </div>
              <div className="webhook-delivery-log">
                {visibleWebhookDeliveries.map((delivery) => {
                  const isReplayed = replayedDeliveryIds.includes(delivery.id);

                  return (
                    <div className={`webhook-delivery-row ${delivery.status}`} key={delivery.id}>
                      <time>{delivery.time}</time>
                      <span>
                        <strong>{delivery.event}</strong>
                        <small>{delivery.traceId}</small>
                      </span>
                      <b>{isReplayed ? "replay_queued" : delivery.status}</b>
                      <span>{delivery.httpStatus} · {delivery.attempts} попытки</span>
                      <button disabled={!canEditSettings} onClick={() => handleReplayWebhook(delivery)} title={canEditSettings ? "Повторить доставку" : access.reason} type="button">
                        Replay
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="api-changelog">
            {apiChangelog.map((entry) => (
              <article key={entry.version}>
                <b>{entry.version}</b>
                <span>
                  <strong>{entry.title}</strong>
                  <small>{entry.detail}</small>
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="work-panel security-controls-panel">
          <SectionTitle title="Security controls" action="2FA, sessions, IP allowlist" />
          <div className="security-control-grid">
            {securityControls.map((control) => (
              <article className={`security-control-card ${control.tone}`} key={control.id}>
                <strong>{control.title}</strong>
                <b>{control.state}</b>
                <span>{control.detail}</span>
              </article>
            ))}
          </div>
          <div className="security-session-list">
            {activeSecuritySessions.map((session) => {
              const isRevoked = revokedSessionIds.includes(session.id);

              return (
                <div className={`security-session-row ${isRevoked ? "revoked" : ""}`} key={session.id}>
                  <span>
                    <strong>{session.user}</strong>
                    <small>{session.role} · {session.device}</small>
                  </span>
                  <code>{session.ip}</code>
                  <b>{isRevoked ? "Отозвана" : session.status}</b>
                  <time>{session.lastSeen}</time>
                  <button disabled={!canEditSettings || isRevoked} onClick={() => handleRevokeSession(session.id)} title={canEditSettings ? "Отозвать сессию" : access.reason} type="button">
                    Revoke
                  </button>
                </div>
              );
            })}
          </div>
          <div className="security-alert-list">
            {securityAlerts.map((alert) => (
              <article className={`security-alert ${alert.level}`} key={alert.id}>
                <time>{alert.time}</time>
                <strong>{alert.text}</strong>
                <span>{alert.route}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
      ) : (
        <section className="work-panel admin-locked-panel" aria-label="Админские настройки скрыты">
          <SectionTitle title="Webhooks, API keys и Security" action="только администратор" />
          <div>
            <ShieldCheck size={22} />
            <strong>Админские настройки скрыты</strong>
            <span>{access.reason}. API ключи, webhook URL, trace ID, IP-адреса сессий и security alerts не отображаются в режиме {roleMode}.</span>
          </div>
        </section>
      )}

      <div className="rules-panel">
        <SectionTitle title="Критичные правила" action="Включены" />
        {[
          ["Нельзя закрыть диалог без тематики", "Обязательное правило для всех каналов"],
          ["Внутренний комментарий не отправляется клиенту", "Разделение режимов ввода"],
          ["Оператор не получает чаты сверх лимита", "Override только с правами старшего"],
          ["Экспорт отчетов фиксируется в аудите", "CSV/XLSX/PDF"]
        ].map(([title, description]) => (
          <div className="rule-row" key={title}>
            <KeyRound size={18} />
            <strong>{title}</strong>
            <span>{description}</span>
          </div>
        ))}
      </div>
    </ProductScreen>
  );
}
