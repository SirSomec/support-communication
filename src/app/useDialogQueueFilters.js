import { useMemo, useState } from "react";
import {
  getConversationTimeValue,
  queueFilterDefaults,
  queueSlaTones,
  queueWaitingStatuses,
  slaSortRank
} from "./dialogModel.js";

export function useDialogQueueFilters({ conversationItems, topics }) {
  const [filter, setFilter] = useState("mine");
  const [queueFilters, setQueueFilters] = useState(() => ({ ...queueFilterDefaults }));
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return conversationItems
      .filter((conversation) => {
        const topic = topics[conversation.id] ?? "";
        // Тред клиента фильтруется по всем своим обращениям: каналы и внутренние
        // комментарии ищутся во всей связке, а не только в актуальном обращении.
        const channels = Array.isArray(conversation.channels) && conversation.channels.length
          ? conversation.channels
          : [conversation.channel];
        const appeals = Array.isArray(conversation.appeals) && conversation.appeals.length
          ? conversation.appeals
          : [conversation];
        const hasInternalComment = appeals.some((appeal) =>
          (appeal.messages ?? []).some((message) => message.type === "internal"));
        const matchesQuery = `${conversation.name} ${conversation.phone} ${conversation.preview} ${channels.join(" ")} ${conversation.queueId ?? ""} ${topic} ${conversation.status}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesFilter =
          filter === "mine" ||
          (filter === "waiting" && queueWaitingStatuses.includes(conversation.status)) ||
          (filter === "sla" && queueSlaTones.includes(conversation.slaTone)) ||
          (filter === "rescue" && (!topic || conversation.slaTone === "danger")) ||
          (filter === "quality" && conversation.tags.some((tag) => ["жалоба", "важно", "возврат"].includes(tag.toLowerCase()))) ||
          filter === "all";
        const matchesChannel = queueFilters.channel === "all" || channels.includes(queueFilters.channel);
        const matchesQueue = queueFilters.queueId === "all" || conversation.queueId === queueFilters.queueId;
        const matchesTopic =
          queueFilters.topic === "all" ||
          (queueFilters.topic === "none" && !topic) ||
          topic === queueFilters.topic;
        const matchesStatus = queueFilters.status === "all" || conversation.status === queueFilters.status;
        const matchesInternal = !queueFilters.onlyInternal || hasInternalComment;

        return matchesQuery && matchesFilter && matchesChannel && matchesQueue && matchesTopic && matchesStatus && matchesInternal;
      })
      .sort((left, right) => {
        if (queueFilters.sort === "sla") {
          return (slaSortRank[left.slaTone] ?? 5) - (slaSortRank[right.slaTone] ?? 5);
        }

        if (queueFilters.sort === "status") {
          return left.status.localeCompare(right.status, "ru");
        }

        if (queueFilters.sort === "channel") {
          return left.channel.localeCompare(right.channel, "ru");
        }

        return getConversationTimeValue(right.time) - getConversationTimeValue(left.time);
      });
  }, [conversationItems, filter, query, queueFilters, topics]);

  function handleQueueFilterChange(field, value) {
    setQueueFilters((current) => ({ ...current, [field]: value }));
  }

  function resetQueueFilters() {
    setQueueFilters({ ...queueFilterDefaults });
  }

  return {
    filter,
    filtered,
    query,
    queueFilters,
    resetQueueFilters,
    setFilter,
    setQuery,
    updateQueueFilter: handleQueueFilterChange
  };
}
