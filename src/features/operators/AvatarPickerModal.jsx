import React, { useRef, useState } from "react";
import { Check, ImagePlus, LoaderCircle, Upload } from "lucide-react";
import { Modal } from "../../ui.jsx";
import { STANDARD_OPERATOR_AVATARS, getStandardOperatorAvatar } from "./avatarCatalog.js";
import { formatAvatarBytes, operatorAvatarPayload, operatorAvatarSelection } from "./avatarModel.js";
import { compressOperatorAvatar } from "./operatorAvatarUpload.js";
import { OperatorAvatar } from "./OperatorAvatar.jsx";
import "./avatar-picker.css";

export function AvatarPickerModal({ operator, onClose, onSave }) {
  const initialSelection = operatorAvatarSelection(operator?.avatar) ?? { kind: "preset", presetId: STANDARD_OPERATOR_AVATARS[0].id };
  const [selection, setSelection] = useState(initialSelection);
  const [uploadInfo, setUploadInfo] = useState(null);
  const [error, setError] = useState("");
  const [isCompressing, setCompressing] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const selectedPreset = selection.kind === "preset" ? getStandardOperatorAvatar(selection.presetId) : null;
  const previewAvatar = selectedPreset?.src ?? selection.dataUrl ?? "";

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setCompressing(true);
    setError("");
    try {
      const prepared = await compressOperatorAvatar(file);
      setSelection({ dataUrl: prepared.dataUrl, kind: "custom" });
      setUploadInfo(prepared);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось подготовить изображение.");
    } finally {
      setCompressing(false);
    }
  }

  async function handleSave() {
    const avatar = operatorAvatarPayload(selection);
    if (!avatar) {
      setError("Выберите стандартный аватар или загрузите изображение.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const result = await onSave(avatar);
      if (!result?.ok) {
        setError(result?.message ?? "Не удалось сохранить аватар.");
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      eyebrow="Профиль оператора"
      footer={
        <>
          <button disabled={isSaving} onClick={onClose} type="button">Отмена</button>
          <button className="primary-action" disabled={isSaving || isCompressing} onClick={handleSave} type="button">
            {isSaving ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <Check aria-hidden="true" size={16} />}
            Сохранить аватар
          </button>
        </>
      }
      onClose={onClose}
      overlayClassName="avatar-picker-overlay"
      panelClassName="avatar-picker-modal"
      title="Выберите аватар"
      titleId="avatar-picker-title"
    >
      <div className="avatar-picker-body">
        <aside className="avatar-picker-preview" aria-label="Предпросмотр аватара">
          <OperatorAvatar avatar={previewAvatar} decorative name={operator?.name ?? "Оператор"} size={96} />
          <div>
            <strong>{operator?.name ?? "Оператор"}</strong>
            <span>Так вас увидят коллеги в рабочих разделах.</span>
          </div>
        </aside>

        <div className="avatar-picker-upload">
          <div>
            <strong>Своё изображение</strong>
            <span>JPEG, PNG или WebP. Сожмём и сохраним не более 2 МБ.</span>
          </div>
          <button disabled={isCompressing} onClick={() => inputRef.current?.click()} type="button">
            {isCompressing ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <Upload aria-hidden="true" size={16} />}
            {isCompressing ? "Подготавливаем…" : "Загрузить"}
          </button>
          <input aria-hidden="true" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleUpload} ref={inputRef} tabIndex={-1} type="file" />
        </div>

        {uploadInfo ? <p className="avatar-picker-upload-result"><ImagePlus aria-hidden="true" size={15} />{uploadInfo.name || "Изображение"} · {formatAvatarBytes(uploadInfo.storedBytes)}</p> : null}
        {error ? <p className="avatar-picker-error" role="alert">{error}</p> : null}

        <section aria-label="Стандартные аватары" className="avatar-picker-presets">
          <header>
            <div><strong>Стандартные аватары</strong><span>20 вариантов</span></div>
            <small>Новый оператор получает один из них случайно.</small>
          </header>
          <div className="avatar-picker-grid">
            {STANDARD_OPERATOR_AVATARS.map((avatar) => {
              const selected = selection.kind === "preset" && selection.presetId === avatar.id;
              return (
                <button
                  aria-label={avatar.label}
                  aria-pressed={selected}
                  className={selected ? "selected" : ""}
                  key={avatar.id}
                  onClick={() => {
                    setSelection({ kind: "preset", presetId: avatar.id });
                    setError("");
                  }}
                  type="button"
                >
                  <img alt="" loading="lazy" src={avatar.src} />
                  {selected ? <span aria-label="Выбрано"><Check aria-hidden="true" size={14} /></span> : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </Modal>
  );
}
