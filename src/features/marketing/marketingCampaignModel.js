export const EMPTY_CAMPAIGN = Object.freeze({
  audienceId: "",
  channels: [],
  clientIds: "",
  contentText: "",
  scheduledAt: "",
  strategy: "manual",
  templateId: "",
  title: ""
});

export function campaignToDraft(campaign) {
  if (!campaign?.id) return { ...EMPTY_CAMPAIGN, channels: [] };
  const blocks = Array.isArray(campaign.content?.blocks) ? campaign.content.blocks : [];
  return {
    ...EMPTY_CAMPAIGN,
    audienceId: campaign.audienceId ?? "",
    channels: Array.isArray(campaign.channels) ? [...campaign.channels] : [],
    contentText: blocks.find((block) => block?.type === "text")?.text ?? "",
    scheduledAt: toLocalDateTimeValue(campaign.scheduledAt),
    strategy: campaign.strategy ?? "manual",
    title: campaign.title ?? ""
  };
}

export function campaignAdditionalBlocks(campaign) {
  const blocks = Array.isArray(campaign?.content?.blocks) ? campaign.content.blocks : [];
  return blocks.filter((block) => block?.type !== "text").map((block, index) => ({ ...block, id: block.id || block.fileId || `campaign_block_${index}` }));
}

export function isCampaignEditable(status) {
  return ["draft", "scheduled"].includes(String(status || "draft"));
}

export function canLaunchCampaignDraft(draft) {
  const hasRecipients = Boolean(String(draft?.audienceId ?? "").trim() || String(draft?.clientIds ?? "").split(",").some((item) => item.trim()));
  return Boolean(
    String(draft?.title ?? "").trim()
    && Array.isArray(draft?.channels)
    && draft.channels.length
    && String(draft?.contentText ?? "").trim()
    && hasRecipients
  );
}

export function campaignStatusLabel(status) {
  const labels = { cancelled: "Отменена", completed: "Завершена", draft: "Черновик", failed: "Ошибка", paused: "На паузе", scheduled: "Запланирована", sending: "Активна" };
  return labels[status] ?? status ?? "Черновик";
}

function toLocalDateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
