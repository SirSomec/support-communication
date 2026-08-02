import { useCallback, useEffect, useRef, useState } from "react";
import { formatFaviconBadgeCount, getAssignedConversationCount, isInboundAssignedMessageEvent } from "./operatorAttentionModel.js";

const SOUND_PREFERENCE_PREFIX = "sc:operator-message-sound:";

export function useOperatorAttention({ conversations = [], operatorId = "" } = {}) {
  const [soundEnabled, setSoundEnabled] = useState(() => readSoundPreference(operatorId));
  const audioContextRef = useRef(null);
  const conversationsRef = useRef(conversations);
  const operatorIdRef = useRef(operatorId);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => {
    operatorIdRef.current = operatorId;
    setSoundEnabled(readSoundPreference(operatorId));
  }, [operatorId]);

  const assignedConversationCount = getAssignedConversationCount(conversations, operatorId);

  useEffect(() => {
    updateFaviconBadge(assignedConversationCount);
    return () => updateFaviconBadge(0);
  }, [assignedConversationCount]);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === "undefined") return null;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    if (audioContextRef.current.state === "suspended") {
      try { await audioContextRef.current.resume(); } catch { return null; }
    }
    return audioContextRef.current;
  }, []);

  const setMessageSoundEnabled = useCallback(async (enabled) => {
    const nextValue = Boolean(enabled);
    setSoundEnabled(nextValue);
    saveSoundPreference(operatorIdRef.current, nextValue);
    if (nextValue) await ensureAudioContext();
  }, [ensureAudioContext]);

  const toggleMessageSound = useCallback(() => {
    void setMessageSoundEnabled(!soundEnabled);
  }, [setMessageSoundEnabled, soundEnabled]);

  const handleRealtimeEvent = useCallback((event) => {
    if (!soundEnabled || typeof document === "undefined" || document.visibilityState !== "hidden" || !isInboundAssignedMessageEvent(event, conversationsRef.current, operatorIdRef.current)) return;
    void ensureAudioContext().then(playIncomingMessageSound);
  }, [ensureAudioContext, soundEnabled]);

  useEffect(() => () => {
    audioContextRef.current?.close?.();
    audioContextRef.current = null;
  }, []);

  return { assignedConversationCount, handleRealtimeEvent, soundEnabled, toggleMessageSound };
}

function playIncomingMessageSound(audioContext) {
  if (!audioContext || audioContext.state !== "running") return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const startedAt = audioContext.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, startedAt);
  oscillator.frequency.exponentialRampToValueAtTime(660, startedAt + 0.16);
  gain.gain.setValueAtTime(0.0001, startedAt);
  gain.gain.exponentialRampToValueAtTime(0.16, startedAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.18);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startedAt);
  oscillator.stop(startedAt + 0.19);
}

function readSoundPreference(operatorId) {
  if (typeof window === "undefined" || !operatorId) return true;
  try { return window.localStorage.getItem(`${SOUND_PREFERENCE_PREFIX}${operatorId}`) !== "false"; } catch { return true; }
}

function saveSoundPreference(operatorId, enabled) {
  if (typeof window === "undefined" || !operatorId) return;
  try { window.localStorage.setItem(`${SOUND_PREFERENCE_PREFIX}${operatorId}`, String(enabled)); } catch { /* Session-only fallback. */ }
}

function updateFaviconBadge(count) {
  if (typeof document === "undefined") return;
  const existing = document.querySelector('link[data-operator-favicon-badge="true"]');
  if (!count) { existing?.remove(); return; }
  const link = existing ?? document.createElement("link");
  link.setAttribute("data-operator-favicon-badge", "true");
  link.setAttribute("rel", "icon");
  link.setAttribute("type", "image/svg+xml");
  link.setAttribute("href", createBadgedFaviconHref(formatFaviconBadgeCount(count)));
  if (!existing) document.head.append(link);
}

function createBadgedFaviconHref(label) {
  const fontSize = label.length > 2 ? 9 : label.length > 1 ? 11 : 13;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0b74ff"/><path d="M18 35v-7a14 14 0 0 1 28 0v7M18 31h-4v13h7V31h-3Zm28 0h4v13h-7V31h3Z" fill="#fff"/><path d="M43 44c0 4-3 6-7 6h-4" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="4"/><circle cx="49" cy="15" r="14" fill="#e5484d" stroke="#fff" stroke-width="3"/><text x="49" y="19" fill="#fff" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
