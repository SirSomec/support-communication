import { useCallback, useEffect, useRef, useState } from "react";
import { presenceService } from "../services/presenceService.js";
import { isPresenceStatus, presenceStatusLabel } from "./presenceModel.js";

export const PRESENCE_REALTIME_EVENT = "operator.presence.updated";
const TAB_HEARTBEAT_MS = 15_000;
const TAB_STALE_AFTER_MS = TAB_HEARTBEAT_MS * 3;

export function useOperatorPresence({ enabled = false, operatorId = "", onToast, tenantId = "" } = {}) {
  const [presence, setPresence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [presenceVersion, setPresenceVersion] = useState(0);
  const operatorIdRef = useRef(operatorId);
  const onToastRef = useRef(onToast);

  useEffect(() => {
    operatorIdRef.current = operatorId;
  }, [operatorId]);

  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  useEffect(() => {
    if (!enabled) {
      setPresence(null);
      return undefined;
    }

    let ignore = false;
    setLoading(true);

    async function loadPresence() {
      const response = await presenceService.fetchMyPresence();
      if (ignore) {
        return;
      }

      if (response.status === "ok") {
        setPresence(response.data?.presence ?? null);
      }
      setLoading(false);
    }

    void loadPresence();
    return () => {
      ignore = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !operatorId || !tenantId || typeof window === "undefined") {
      return undefined;
    }

    const registryKey = `sc_operator_presence_tabs:${tenantId}:${operatorId}`;
    const tabId = createTabId();
    const registerTab = () => updateTabRegistry(registryKey, tabId, true);
    const unregisterTab = () => updateTabRegistry(registryKey, tabId, false);
    const handlePageHide = (event) => {
      const isLastOpenTab = unregisterTab();
      if (!event.persisted && isLastOpenTab) {
        void presenceService.markMyPresenceUnavailableIfOnline({ keepalive: true });
      }
    };
    const handlePageShow = () => registerTab();

    registerTab();
    const heartbeat = window.setInterval(registerTab, TAB_HEARTBEAT_MS);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      unregisterTab();
    };
  }, [enabled, operatorId, tenantId]);

  const changeStatus = useCallback(async (status) => {
    if (!isPresenceStatus(status)) {
      return { ok: false };
    }

    setPending(true);
    const response = await presenceService.setMyPresence(status);
    setPending(false);

    if (response.status !== "ok") {
      onToastRef.current?.(response.error?.message ?? "Не удалось обновить статус.");
      return { ok: false };
    }

    setPresence(response.data?.presence ?? { status });
    if (response.data?.changed) {
      onToastRef.current?.(`Статус обновлен: ${presenceStatusLabel(status)}.`);
    }
    return { ok: true };
  }, []);

  const handleRealtimeEvent = useCallback((event) => {
    if (event?.eventName !== PRESENCE_REALTIME_EVENT) {
      return;
    }

    setPresenceVersion((version) => version + 1);

    const data = event.data ?? {};
    if (data.operatorId && data.operatorId === operatorIdRef.current && isPresenceStatus(data.status)) {
      setPresence({ operatorId: data.operatorId, since: data.since ?? null, status: data.status });
    }
  }, []);

  return {
    changeStatus,
    handleRealtimeEvent,
    loading,
    pending,
    presence,
    presenceVersion
  };
}

function createTabId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function updateTabRegistry(key, tabId, connected) {
  try {
    const now = Date.now();
    const tabs = readTabRegistry(key, now);
    if (connected) {
      tabs[tabId] = now;
    } else {
      delete tabs[tabId];
    }
    window.localStorage.setItem(key, JSON.stringify(tabs));
    return !connected && Object.keys(tabs).length === 0;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
    // In that case we fail safe for the operator: do not infer that this is
    // the last tab and accidentally change a status selected elsewhere.
    return false;
  }
}

function readTabRegistry(key, now) {
  const raw = window.localStorage.getItem(key);
  const parsed = raw ? JSON.parse(raw) : {};
  const tabs = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  for (const [tabId, lastSeenAt] of Object.entries(tabs)) {
    if (!Number.isFinite(lastSeenAt) || now - lastSeenAt > TAB_STALE_AFTER_MS) {
      delete tabs[tabId];
    }
  }
  return tabs;
}
