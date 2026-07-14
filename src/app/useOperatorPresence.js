import { useCallback, useEffect, useRef, useState } from "react";
import { presenceService } from "../services/presenceService.js";
import { isPresenceStatus, presenceStatusLabel } from "./presenceModel.js";

export const PRESENCE_REALTIME_EVENT = "operator.presence.updated";

export function useOperatorPresence({ enabled = false, operatorId = "", onToast } = {}) {
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
