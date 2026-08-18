import React, { useEffect, useState } from "react";
import { isCustomOperatorAvatar } from "./avatarModel.js";
import { getStandardOperatorAvatarBySrc } from "./avatarCatalog.js";
import "./operator-avatar.css";

export function OperatorAvatar({
  alt,
  avatar,
  className = "",
  decorative = false,
  name = "Оператор",
  size = 32
}) {
  const requestedSrc = safeAvatarSource(avatar);
  const [failedSrc, setFailedSrc] = useState("");

  useEffect(() => {
    setFailedSrc("");
  }, [requestedSrc]);

  const src = requestedSrc && requestedSrc !== failedSrc ? requestedSrc : "";
  const classes = ["operator-avatar", className].filter(Boolean).join(" ");
  const style = { "--operator-avatar-size": `${size}px` };

  if (src) {
    return (
      <img
        alt={decorative ? "" : alt ?? `Аватар: ${name}`}
        className={classes}
        draggable="false"
        onError={() => setFailedSrc(requestedSrc)}
        src={src}
        style={style}
      />
    );
  }

  const fallbackProps = decorative ? { "aria-hidden": true } : { "aria-label": alt ?? `Аватар: ${name}`, role: "img" };
  return (
    <span className={`${classes} operator-avatar-fallback`} style={style} {...fallbackProps}>
      {initials(name)}
    </span>
  );
}

function safeAvatarSource(value) {
  const src = String(value ?? "").trim();
  if (!src) return "";
  return getStandardOperatorAvatarBySrc(src) || isCustomOperatorAvatar(src) ? src : "";
}

function initials(value) {
  return String(value ?? "")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "--";
}
