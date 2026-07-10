import { useEffect, useState } from "react";
import { templateService } from "../services/templateService.js";

export function useTemplateLibrary({ draft, enabled = true, selectedChannel, selectedTopic, setToast }) {
  const [templateLibrary, setTemplateLibrary] = useState([]);
  const [saveTemplateDraft, setSaveTemplateDraft] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setTemplateLibrary([]);
      return undefined;
    }

    let ignore = false;

    async function loadTemplates() {
      const response = await templateService.fetchTemplates({ operatorId: "current" });
      if (ignore) {
        return;
      }

      if (response.status !== "ok") {
        setToast(response.error?.message ?? "Не удалось загрузить шаблоны.");
        return;
      }

      const items = Array.isArray(response.data?.items)
        ? response.data.items
        : Array.isArray(response.data?.templates)
          ? response.data.templates
          : [];
      setTemplateLibrary(items);
    }

    loadTemplates();

    return () => {
      ignore = true;
    };
  }, [enabled, setToast]);

  function handleOpenTemplateSave(source) {
    const sourceText = typeof source === "string" ? source : draft;

    if (!sourceText.trim()) {
      setToast("Введите текст ответа перед сохранением шаблона.");
      return;
    }

    setSaveTemplateDraft({
      title: selectedTopic ? selectedTopic.split(" / ").at(-1) : "Новый шаблон",
      scope: "Личный",
      channel: selectedChannel,
      topic: selectedTopic || "Без тематики",
      text: sourceText.trim()
    });
  }

  async function handleTemplateSave(template) {
    const response = await templateService.saveTemplate(template);
    if (response.status !== "ok") {
      setToast(response.error?.message ?? "Не удалось сохранить шаблон.");
      return;
    }

    const saved = response.data?.template ?? response.data ?? template;
    const next = {
      id: saved.id ?? `chat-template-${Date.now()}`,
      usage: saved.usage ?? 0,
      updated: saved.updated ?? "только что",
      scope: saved.scope ?? template.scope ?? "Личный",
      ...template,
      ...saved
    };

    setTemplateLibrary((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    setSaveTemplateDraft(null);
    setToast(`Шаблон сохранен: ${next.title}`);
  }

  function closeSaveTemplateDialog() {
    setSaveTemplateDraft(null);
  }

  return {
    closeSaveTemplateDialog,
    handleOpenTemplateSave,
    handleTemplateSave,
    saveTemplateDraft,
    setTemplateLibrary,
    templateLibrary
  };
}
