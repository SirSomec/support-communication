import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reportService } from "../../../services/reportService.js";
import { normalizeReportWorkspace } from "../model/reportWorkspaceModel.js";
import { reportWorkspaceQuery } from "../model/reportViewState.js";

const AUTO_REFRESH_MS = 60_000;
const STALE_AFTER_MS = 5 * 60_000;

export function useReportWorkspace(view, options = {}) {
  const enabled = options.enabled !== false;
  const query = useMemo(() => reportWorkspaceQuery(view), [
    view.customRange.from,
    view.customRange.to,
    view.filters.channel,
    view.filters.operatorId,
    view.filters.queueId,
    view.filters.resolutionOutcome,
    view.filters.status,
    view.filters.teamId,
    view.filters.topic,
    view.period
  ]);
  const queryKey = useMemo(() => JSON.stringify(query), [query]);
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [receivedAt, setReceivedAt] = useState(0);
  const [workspaceQueryKey, setWorkspaceQueryKey] = useState("");
  const workspaceRef = useRef(null);

  const refresh = useCallback(() => setRetryKey((current) => current + 1), []);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setRefreshing(false);
      return undefined;
    }
    const controller = new AbortController();
    const hasPrevious = Boolean(workspaceRef.current);
    if (hasPrevious) setRefreshing(true);
    else setLoading(true);
    setError("");

    void reportService.fetchReportWorkspace(query, { signal: controller.signal }).then((response) => {
      if (controller.signal.aborted) return;
      if (response.status !== "ok") {
        if (response.error?.code !== "request_cancelled") {
          setError(response.error?.message ?? "Не удалось загрузить отчет.");
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const normalized = normalizeReportWorkspace(response.data ?? {});
      setWorkspace(normalized);
      setWorkspaceQueryKey(queryKey);
      setReceivedAt(Date.now());
      setLoading(false);
      setRefreshing(false);
    });

    return () => controller.abort();
  }, [enabled, queryKey, retryKey]);

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
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const workspaceMatchesView = Boolean(workspace && workspaceQueryKey === queryKey);

  return {
    error,
    loading,
    online,
    query,
    receivedAt,
    refresh,
    refreshing,
    stale: Boolean(workspace && (Date.now() - receivedAt > STALE_AFTER_MS || !online || error || !workspaceMatchesView)),
    workspace,
    workspaceMatchesView
  };
}
