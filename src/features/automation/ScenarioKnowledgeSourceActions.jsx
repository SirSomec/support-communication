import React, { useRef } from "react";
import { BookOpen, Link2, Upload } from "lucide-react";
import { KNOWLEDGE_UPLOAD_ACCEPT } from "../knowledge/knowledgeUploadPipeline.js";

/**
 * Действия шага «Знания» в настройках бота: любой тип источника доступен прямо
 * отсюда — загрузка файлов, источник из опубликованной статьи, URL-страница.
 * MCP-подключения проходят одобрение сервис-админа, поэтому создаются в разделе «Знания».
 */
export function ScenarioKnowledgeSourceActions({ disabled = false, onAddArticleSource, onAddUrlSource, onUploadFiles, uploadProgress = null }) {
  const inputRef = useRef(null);
  return (
    <div className="scenario-knowledge-source-actions">
      {onUploadFiles ? (
        <>
          <button disabled={disabled} onClick={() => inputRef.current?.click()} title="TXT, Markdown или HTML — можно выбрать несколько файлов" type="button">
            <Upload size={15} /> {uploadProgress ? `Загрузка ${Math.min(uploadProgress.done + 1, uploadProgress.total)}/${uploadProgress.total}…` : "Загрузить файлы"}
          </button>
          <input
            accept={KNOWLEDGE_UPLOAD_ACCEPT}
            hidden
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length) void onUploadFiles(files);
            }}
            ref={inputRef}
            type="file"
          />
        </>
      ) : null}
      {onAddArticleSource ? (
        <button disabled={disabled} onClick={onAddArticleSource} type="button">
          <BookOpen size={15} /> Из статьи
        </button>
      ) : null}
      {onAddUrlSource ? (
        <button disabled={disabled} onClick={onAddUrlSource} type="button">
          <Link2 size={15} /> Добавить URL-страницу
        </button>
      ) : null}
    </div>
  );
}
