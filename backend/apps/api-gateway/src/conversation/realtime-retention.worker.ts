import { writeStructuredLog } from "@support-communication/observability";
import type { ConversationRepository } from "./conversation.repository.js";

export interface RealtimeRetentionWorkerOptions {
  intervalMs?: number;
  now?: () => Date;
  repository: Pick<ConversationRepository, "pruneRealtimeEvents">;
  retentionMs?: number;
}

export interface RealtimeRetentionWorkerHandle {
  stop(): void;
}

const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export async function runRealtimeRetentionOnce(options: RealtimeRetentionWorkerOptions): Promise<{ before: string; removed: number }> {
  const now = options.now?.() ?? new Date();
  const retentionMs = positiveDuration(options.retentionMs, DEFAULT_RETENTION_MS);
  const before = new Date(now.getTime() - retentionMs).toISOString();
  const removed = await options.repository.pruneRealtimeEvents({ before });
  return { before, removed };
}

export function startRealtimeRetentionWorker(options: RealtimeRetentionWorkerOptions): RealtimeRetentionWorkerHandle {
  const intervalMs = positiveDuration(options.intervalMs, 60 * 60 * 1_000);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      const result = await runRealtimeRetentionOnce(options);
      writeStructuredLog("info", "Realtime retention pass completed", {
        ...result,
        operation: "realtime.retention",
        service: "api-gateway"
      });
    } catch (error) {
      writeStructuredLog("warn", "Realtime retention pass failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
        operation: "realtime.retention",
        service: "api-gateway"
      });
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
        timer.unref?.();
      }
    }
  };

  timer = setTimeout(tick, 0);
  timer.unref?.();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    }
  };
}

function positiveDuration(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}
