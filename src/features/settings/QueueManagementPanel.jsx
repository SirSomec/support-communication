import React, { useEffect, useState } from "react";
import { ListTree, PauseCircle, PlayCircle, Plus, RefreshCw, Save } from "lucide-react";
import { FieldHint, InlineHint, SettingsSectionHeader } from "./SettingsPrimitives.jsx";
import { routingService } from "../../services/routingService.js";
import { settingsService } from "../../services/settingsService.js";

export function QueueManagementPanel({ access, canEditSettings, onSummaryChange, onToast }) {
  const [queues, setQueues] = useState([]);
  const [teams, setTeams] = useState([]);
  const [newQueueName, setNewQueueName] = useState("");
  const [newQueueTeamId, setNewQueueTeamId] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const canManageQueues = canEditSettings && !error;

  useEffect(() => {
    let cancelled = false;

    async function loadQueues() {
      setLoading(true);
      setError("");
      const [queueResponse, employeeResponse] = await Promise.all([
        routingService.fetchQueues(),
        settingsService.fetchEmployees()
      ]);

      if (cancelled) return;

      if (queueResponse.status !== "ok" || employeeResponse.status !== "ok") {
        setError(queueResponse.error?.message ?? employeeResponse.error?.message ?? "Не удалось загрузить очереди.");
        setQueues([]);
        setTeams([]);
        onSummaryChange?.({ unavailable: true });
        setLoading(false);
        return;
      }

      setQueues(queueResponse.data?.queues ?? []);
      setTeams(employeeResponse.data?.groups ?? []);
      setLoading(false);
    }

    loadQueues();
    return () => { cancelled = true; };
  }, [onSummaryChange, reloadToken]);

  useEffect(() => {
    if (loading || error) return;

    onSummaryChange?.({
      active: queues.filter((queue) => queue.status === "active").length,
      total: queues.length
    });
  }, [error, loading, onSummaryChange, queues]);

  async function createQueue(event) {
    event.preventDefault();
    const name = newQueueName.trim();
    if (!name || !canManageQueues || busy) return;

    const selectedTeam = teams.find((team) => team.id === newQueueTeamId);
    setBusy("create");
    setActionError("");
    const response = await routingService.createQueue({
      ...(selectedTeam ? { defaultTeamId: selectedTeam.id, memberIds: selectedTeam.memberIds ?? [] } : {}),
      name
    });
    setBusy("");

    if (response.status !== "ok" || !response.data?.queue) {
      setActionError(response.error?.message ?? "Не удалось создать очередь.");
      return;
    }

    const queue = response.data.queue;
    setQueues((current) => [...current, queue]);
    setNewQueueName("");
    setNewQueueTeamId("");
    onToast?.(`${queue.name}: очередь создана.`);
  }

  async function updateQueue(queue, patch, successMessage) {
    if (!canManageQueues || busy) return false;

    setBusy(`queue:${queue.id}`);
    setActionError("");
    const response = await routingService.updateQueue(queue.id, patch);
    setBusy("");

    if (response.status !== "ok" || !response.data?.queue) {
      setActionError(response.error?.message ?? `Не удалось изменить очередь «${queue.name}».`);
      return false;
    }

    const savedQueue = response.data.queue;
    setQueues((current) => current.map((item) => item.id === savedQueue.id ? savedQueue : item));
    onToast?.(successMessage(savedQueue));
    return true;
  }

  return (
    <section className="settings-section queue-management-panel">
      <SettingsSectionHeader
        title="Очереди"
        meta={loading ? "загрузка" : `${queues.filter((queue) => queue.status === "active").length} из ${queues.length} активны`}
        hint="Очереди определяют, куда попадают новые обращения и какая команда их разбирает."
        actions={
          <button className="settings-ghost-action" disabled={loading} onClick={() => setReloadToken((current) => current + 1)} type="button">
            <RefreshCw size={16} /> Обновить
          </button>
        }
      />

      {error ? <div className="settings-form-error" role="alert">{error}</div> : null}
      {actionError ? <div className="settings-form-error" role="alert">{actionError}</div> : null}

      <div className="queue-directory-layout">
        <div className="queue-directory-list" aria-label="Список очередей">
          {loading ? <div className="settings-empty-state"><ListTree size={22} /><strong>Загружаем очереди</strong></div> : null}
          {!loading && !queues.length ? (
            <div className="settings-empty-state">
              <ListTree size={22} />
              <strong>Очередей пока нет</strong>
              <span>Создайте первую очередь в форме справа — она сразу станет доступна для интеграций.</span>
            </div>
          ) : null}
          {queues.map((queue) => (
            <QueueCard
              busy={busy === `queue:${queue.id}`}
              canManage={canManageQueues}
              key={queue.id}
              onUpdate={updateQueue}
              queue={queue}
              teams={teams}
            />
          ))}
        </div>

        <aside className="queue-directory-create-card">
          <div>
            <span>Новая очередь</span>
            <h3>Добавить маршрут обращений</h3>
            <p>Название будет видно в интеграциях, фильтрах диалогов и отчетах.</p>
          </div>
          <form className="settings-form" onSubmit={createQueue}>
            <label>
              <span>Название очереди</span>
              <input
                aria-label="Название новой очереди"
                disabled={!canManageQueues || Boolean(busy)}
                onChange={(event) => setNewQueueName(event.target.value)}
                placeholder="Например, Основная поддержка"
                value={newQueueName}
              />
              <FieldHint>От 1 до 120 символов.</FieldHint>
            </label>
            <label>
              <span>Команда по умолчанию</span>
              <select
                aria-label="Команда новой очереди"
                disabled={!canManageQueues || Boolean(busy)}
                onChange={(event) => setNewQueueTeamId(event.target.value)}
                value={newQueueTeamId}
              >
                <option value="">Без команды</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
              <FieldHint>Команду можно назначить или изменить позже.</FieldHint>
            </label>
            <button className="primary-action" disabled={!canManageQueues || Boolean(busy) || !newQueueName.trim()} type="submit">
              <Plus size={16} /> {busy === "create" ? "Создаём…" : "Создать очередь"}
            </button>
          </form>
        </aside>
      </div>
    </section>
  );
}

function QueueCard({ busy, canManage, onUpdate, queue, teams }) {
  const [name, setName] = useState(queue.name);

  useEffect(() => {
    setName(queue.name);
  }, [queue.name]);

  const selectedTeam = teams.find((team) => team.id === queue.defaultTeamId);
  const isActive = queue.status === "active";

  async function saveName() {
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName === queue.name) return;
    const saved = await onUpdate(queue, { name: normalizedName }, (updated) => `${updated.name}: название очереди сохранено.`);
    if (!saved) setName(queue.name);
  }

  async function changeTeam(teamId) {
    const team = teams.find((item) => item.id === teamId);
    await onUpdate(queue, {
      defaultTeamId: team?.id ?? null,
      memberIds: team?.memberIds ?? []
    }, (updated) => `${updated.name}: команда очереди изменена.`);
  }

  return (
    <article className={`queue-directory-card ${isActive ? "active" : "inactive"}`}>
      <header>
        <div>
          <span className={`integration-status ${isActive ? "active" : "paused"}`}>{isActive ? "Активна" : "Приостановлена"}</span>
          <strong>{queue.name}</strong>
        </div>
        <span>{queue.memberCounts?.queue ?? 0} участников</span>
      </header>
      <div className="queue-directory-fields">
        <label>
          <span>Название</span>
          <div className="queue-directory-name-control">
            <input disabled={!canManage || busy} onChange={(event) => setName(event.target.value)} value={name} />
            <button disabled={!canManage || busy || !name.trim() || name.trim() === queue.name} onClick={saveName} title="Сохранить название" type="button">
              <Save size={16} /> Сохранить
            </button>
          </div>
        </label>
        <label>
          <span>Команда по умолчанию</span>
          <select disabled={!canManage || busy} onChange={(event) => changeTeam(event.target.value)} value={queue.defaultTeamId ?? ""}>
            <option value="">Без команды</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <FieldHint>{selectedTeam ? `Обращения получает команда «${selectedTeam.name}».` : "Назначьте команду, чтобы обращения автоматически попадали к её сотрудникам."}</FieldHint>
        </label>
      </div>
      <footer>
        <InlineHint>{isActive ? "Очередь доступна для новых интеграций." : "Новые интеграции не могут выбрать эту очередь."}</InlineHint>
        <button
          className={isActive ? "queue-status-action danger" : "queue-status-action"}
          disabled={!canManage || busy}
          onClick={() => onUpdate(
            queue,
            { status: isActive ? "inactive" : "active" },
            (updated) => `${updated.name}: очередь ${updated.status === "active" ? "возобновлена" : "приостановлена"}.`
          )}
          type="button"
        >
          {isActive ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
          {isActive ? "Приостановить" : "Возобновить"}
        </button>
      </footer>
    </article>
  );
}
