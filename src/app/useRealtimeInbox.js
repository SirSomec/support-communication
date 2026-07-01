import { useEffect, useRef } from "react";
import { getAccessToken } from "./sessionStore.js";

const RETRY_DELAY_MS = 1500;

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
    if (!token || typeof window === "undefined" || typeof window.EventSource === "undefined") {
      return undefined;
    }

    let disposed = false;
    let reconnectTimer = null;
    let source = null;

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
      source.onerror = () => {
        if (disposed) {
          return;
        }
        source?.close();
        reconnectTimer = window.setTimeout(subscribe, RETRY_DELAY_MS);
      };
    };

    subscribe();

    return () => {
      disposed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      source?.close();
    };
  }, [enabled]);
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
