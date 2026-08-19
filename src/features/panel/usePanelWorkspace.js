import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { presenceService } from "../../services/presenceService.js";
import { routingService } from "../../services/routingService.js";
import { shiftService } from "../../services/shiftService.js";
import { PANEL_AUTO_REFRESH_MS, presenceRangeForDate } from "./panelModel.js";

const STALE_AFTER_MS = PANEL_AUTO_REFRESH_MS * 3;

/**
 * Keeps the panel a live view while preserving the last usable snapshot when
 * a background request fails. The explicit fallback poll also works on
 * deployments where realtime fan-out has not been enabled yet.
 */
export function usePanelWorkspace({ channel, presenceDate, presenceVersion = 0, workloadPeriod }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState({ presence: "", shift: "", workload: "" });
  const [receivedAt, setReceivedAt] = useState(0);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [refreshKey, setRefreshKey] = useState(0);
  const snapshotRef = useRef(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const presenceRange = useMemo(() => presenceRangeForDate(presenceDate), [presenceDate]);
  const queryKey = useMemo(() => JSON.stringify({ channel, presenceRange, workloadPeriod }), [channel, presenceRange, workloadPeriod]);
  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const hasSnapshot = Boolean(snapshotRef.current);
    if (hasSnapshot) setRefreshing(true);
    else setLoading(true);

    const workloadFilters = {
      ...(channel && channel !== "Все каналы" ? { channel } : {}),
      period: workloadPeriod,
      timezoneOffsetMinutes: -new Date().getTimezoneOffset()
    };
    const presenceFilters = presenceRange ?? {};

    void Promise.all([
      routingService.fetchWorkload(workloadFilters, { signal: controller.signal }),
      presenceService.fetchTeamPresence(presenceFilters, { signal: controller.signal }),
      shiftService.fetchCurrent({ signal: controller.signal })
    ]).then(([workloadResponse, presenceResponse, shiftResponse]) => {
      if (controller.signal.aborted) return;

      const workloadOk = workloadResponse.status === "ok";
      const presenceOk = presenceResponse.status === "ok";
      const shiftOk = shiftResponse.status === "ok";
      const previous = snapshotRef.current;

      if (workloadOk) {
        const nextSnapshot = {
          presence: presenceOk ? presenceResponse.data ?? null : previous?.presence ?? null,
          shift: shiftOk ? shiftResponse.data?.shift ?? null : previous?.shift ?? null,
          workload: workloadResponse.data ?? null
        };
        setSnapshot(nextSnapshot);
        setReceivedAt(Date.now());
      }

      setErrors({
        presence: presenceOk || presenceResponse.error?.code === "request_cancelled" ? "" : (presenceResponse.error?.message ?? "Не удалось обновить статусы команды."),
        shift: shiftOk || shiftResponse.error?.code === "request_cancelled" ? "" : (shiftResponse.error?.message ?? "Не удалось обновить состав смены."),
        workload: workloadOk || workloadResponse.error?.code === "request_cancelled" ? "" : (workloadResponse.error?.message ?? "Не удалось обновить нагрузку.")
      });
      setLoading(false);
      setRefreshing(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setErrors((current) => ({ ...current, workload: "Не удалось обновить нагрузку." }));
      setLoading(false);
      setRefreshing(false);
    });

    return () => controller.abort();
  }, [presenceVersion, queryKey, refreshKey]);

  useEffect(() => {
    const handleOnline = () => { setOnline(true); refresh(); };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine !== false) refresh();
    }, PANEL_AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return {
    error: errors.workload,
    errors,
    loading,
    online,
    presence: snapshot?.presence ?? null,
    receivedAt,
    refresh,
    refreshing,
    shift: snapshot?.shift ?? null,
    stale: Boolean(snapshot && (!online || errors.workload || Date.now() - receivedAt > STALE_AFTER_MS)),
    workload: snapshot?.workload ?? null
  };
}
