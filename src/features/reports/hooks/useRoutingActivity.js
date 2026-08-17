import { useEffect, useMemo, useState } from "react";
import { reportService } from "../../../services/reportService.js";
import { reportRoutingQuery } from "../model/reportViewState.js";

export function useRoutingActivity(view, options = {}) {
  const enabled = options.enabled !== false;
  const query = useMemo(() => reportRoutingQuery(view), [
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
  const [state, setState] = useState({ dataQueryKey: "", error: "", loading: true, rows: [], totals: {} });

  useEffect(() => {
    if (!enabled) {
      setState((current) => ({ ...current, loading: false }));
      return undefined;
    }
    const controller = new AbortController();
    setState({ dataQueryKey: "", error: "", loading: true, rows: [], totals: {} });
    void reportService.fetchRoutingActivityReport(query, { signal: controller.signal }).then((response) => {
      if (controller.signal.aborted) return;
      if (response.status !== "ok") {
        setState((current) => ({
          ...current,
          error: response.error?.message ?? "Не удалось загрузить назначения и передачи.",
          loading: false
        }));
        return;
      }
      setState({
        dataQueryKey: queryKey,
        error: "",
        loading: false,
        rows: Array.isArray(response.data?.rows) ? response.data.rows : [],
        totals: response.data?.totals ?? {}
      });
    });
    return () => controller.abort();
  }, [enabled, queryKey]);

  const matchesQuery = state.dataQueryKey === queryKey;
  return {
    ...state,
    matchesQuery,
    rows: matchesQuery ? state.rows : [],
    totals: matchesQuery ? state.totals : {}
  };
}
