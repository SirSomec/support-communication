import { useEffect, useRef } from "react";
import { getAccessToken } from "./sessionStore.js";
import { apiRequest } from "../services/apiClient.js";

const RETRY_DELAY_MS = 1500;
const REPLAY_POLL_INTERVAL_MS = 1500;
const SSE_QUERY_TOKEN_FLAG = "true";

export function useRealtimeInbox({ enabled, onEvent }) {
  const lastEventIdRef = useRef("");
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const token = getAccessToken();
    if (!token || typeof window === "undefined") {
      return undefined;
    }

    let disposed = false;
    let reconnectTimer = null;
    let pollTimer = null;
    let polling = false;
    let source = null;
    let sseConnected = false;

    const pollReplay = async () => {
      if (disposed || polling) {
        return;
      }

      if (sseConnected) {
        pollTimer = window.setTimeout(pollReplay, REPLAY_POLL_INTERVAL_MS);
        return;
      }

      polling = true;
      try {
        const nextEventId = await replayRealtimeEvents({
          lastEventId: lastEventIdRef.current,
          onEvent: onEventRef.current
        });
        if (nextEventId) {
          lastEventIdRef.current = nextEventId;
        }
      } finally {
        polling = false;
        if (!disposed) {
          pollTimer = window.setTimeout(pollReplay, REPLAY_POLL_INTERVAL_MS);
        }
      }
    };

    const subscribe = () => {
      const params = new URLSearchParams({
        accessToken: token
      });

      if (lastEventIdRef.current) {
        params.set("since", lastEventIdRef.current);
      }

      source = new window.EventSource(`/api/v1/realtime/events/stream?${params.toString()}`);

      const handleEvent = (nativeEvent) => {
        const parsed = parseSseEvent(nativeEvent);
        if (!parsed) {
          return;
        }

        lastEventIdRef.current = parsed.eventId;
        onEventRef.current?.(parsed);
      };

      source.addEventListener("message.created", handleEvent);
      source.addEventListener("conversation.updated", handleEvent);
      source.onopen = () => {
        sseConnected = true;
      };
      source.onerror = () => {
        sseConnected = false;
        if (disposed) {
          return;
        }
        source?.close();
        reconnectTimer = window.setTimeout(subscribe, RETRY_DELAY_MS);
      };
    };

    if (shouldOpenRealtimeEventSource({
      eventSourceAvailable: typeof window.EventSource !== "undefined",
      queryTokenEnabled: isSseQueryTokenEnabled(),
      token
    })) {
      subscribe();
    }
    void pollReplay();

    return () => {
      disposed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (pollTimer) {
        window.clearTimeout(pollTimer);
      }
      source?.close();
    };
  }, [enabled]);
}

export function shouldOpenRealtimeEventSource({
  eventSourceAvailable = false,
  queryTokenEnabled = false,
  token = ""
} = {}) {
  return Boolean(token && eventSourceAvailable && queryTokenEnabled);
}

function isSseQueryTokenEnabled() {
  return import.meta.env?.VITE_PILOT_SSE_QUERY_TOKEN === SSE_QUERY_TOKEN_FLAG
    || import.meta.env?.VITE_SSE_QUERY_TOKEN === SSE_QUERY_TOKEN_FLAG;
}

export async function fetchRealtimeReplay({ since } = {}) {
  return apiRequest("/realtime/events", {
    operation: "fetchRealtimeEvents",
    query: since ? { since } : {},
    service: "realtimeService"
  });
}

export async function replayRealtimeEvents({
  fetchEvents = fetchRealtimeReplay,
  lastEventId = "",
  onEvent
} = {}) {
  const response = await fetchEvents({ since: lastEventId || undefined });
  if (response?.status !== "ok") {
    return lastEventId;
  }

  const events = Array.isArray(response.data?.events) ? response.data.events : [];
  let nextEventId = lastEventId;
  for (const event of events) {
    const eventId = String(event?.eventId ?? "").trim();
    const eventName = String(event?.eventName ?? "").trim();
    if (!eventId || !eventName) {
      continue;
    }

    nextEventId = eventId;
    onEvent?.({
      ...event,
      eventId,
      eventName
    });
  }

  return nextEventId;
}

function parseSseEvent(nativeEvent) {
  if (!nativeEvent?.data) {
    return null;
  }

  try {
    const payload = JSON.parse(nativeEvent.data);
    const eventId = String(payload?.eventId ?? nativeEvent.lastEventId ?? "").trim();
    const eventName = String(payload?.eventName ?? nativeEvent.type ?? "").trim();

    if (!eventId || !eventName) {
      return null;
    }

    return {
      ...payload,
      eventId,
      eventName
    };
  } catch {
    return null;
  }
}
