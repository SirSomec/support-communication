import React, { useMemo, useState } from "react";
import { Pencil, Plus, Search, ShieldCheck, Tag, ToggleLeft, ToggleRight } from "lucide-react";
import { ChannelList, SectionTitle, SegmentedControl, ToolbarSearch } from "../../ui.jsx";
import { topicDirectorySeed } from "../../data.js";

const topicStatusFilters = ["Все", "Активные", "Архив"];

export function TopicDirectoryPanel({ access, canEditSettings, onToast, roleMode }) {
  const [topicDirectory, setTopicDirectory] = useState(topicDirectorySeed);
  const [topicQuery, setTopicQuery] = useState("");
  const [topicStatusFilter, setTopicStatusFilter] = useState("Все");
  const normalizedTopicQuery = topicQuery.trim().toLowerCase();

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

  return (
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
  );
}
