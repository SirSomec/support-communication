import type { RoutingConversation } from "./routing.fixtures.js";
import type { RoutingJobDescriptor, RoutingRepository } from "./routing.repository.js";

interface SlaTimerTransitionInput {
  conversation: Pick<RoutingConversation, "id" | "status">;
  job: RoutingJobDescriptor;
  now?: Date;
}

interface SlaTimerClaimWorkerInput {
  limit?: number;
  now?: Date;
  routingRepository: Pick<RoutingRepository, "listJobs" | "saveJob">;
}

interface SlaTimerFailureInput {
  error: Error | string;
  failedAt?: Date;
  jobId: string;
  maxAttempts?: number;
  retryBackoffMs?: number;
  routingRepository: Pick<RoutingRepository, "listJobs" | "saveJob">;
}

interface SlaTimerApplyWorkerInput {
  completedAt?: Date;
  routingRepository: Pick<RoutingRepository, "readState" | "saveState">;
  transition: SlaTimerTransition;
}

interface SlaTimerClaimWorkerResult {
  claimed: RoutingJobDescriptor[];
}

interface SlaTimerApplyWorkerResult {
  conversationId: string;
  jobId: string;
  overdueDescriptor?: {
    conversationId: string;
    jobId: string;
    kind: "sla.timer.overdue";
    occurredAt: string;
    queue: "sla-timers";
  };
  realtimeEvent?: {
    data: {
      jobId: string;
      state: "overdue";
    };
    occurredAt: string;
    resourceId: string;
    resourceType: "conversation";
    type: "sla.timer.updated";
  };
  status: "applied" | "skipped";
}

interface SlaTimerTransitionReady {
  action: "resume_sla";
  conversationId: string;
  fromStatus: "paused";
  jobId: string;
  status: "ready";
  toStatus: "active";
}

interface SlaTimerOverdueTransitionReady {
  action: "mark_sla_overdue";
  conversationId: string;
  fromStatus: "active" | "assigned";
  jobId: string;
  status: "ready";
  toSlaTone: "danger";
  toStatus: "active" | "assigned";
}

interface SlaTimerTransitionSkipped {
  action: string | undefined;
  conversationId: string;
  jobId: string;
  reason: "not_due" | "not_paused" | "unsupported_action" | "unsupported_queue";
  status: "skipped";
}

export type SlaTimerTransition = SlaTimerOverdueTransitionReady | SlaTimerTransitionReady | SlaTimerTransitionSkipped;

export function claimDueSlaTimerJobs(input: SlaTimerClaimWorkerInput): SlaTimerClaimWorkerResult {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.trunc(input.limit ?? 1));
  const dueJobs = input.routingRepository.listJobs()
    .filter((job) => job.queue === "sla-timers")
    .filter((job) => isClaimableSlaTimerJob(job, now))
    .sort(compareJobDueAt)
    .slice(0, limit);

  const claimed = dueJobs.flatMap((job) => {
    const current = input.routingRepository.listJobs().find((item) => item.id === job.id);
    if (!current || !isClaimableSlaTimerJob(current, now)) {
      return [];
    }

    return [input.routingRepository.saveJob({
      ...current,
      claimedAt: now.toISOString(),
      status: "claimed"
    })];
  });

  return { claimed };
}

export function recordSlaTimerJobFailure(input: SlaTimerFailureInput): RoutingJobDescriptor {
  const job = input.routingRepository.listJobs().find((item) => item.id === input.jobId);
  if (!job) {
    throw new Error(`sla_timer_job_not_found:${input.jobId}`);
  }

  const failedAt = input.failedAt ?? new Date();
  const attempts = Math.max(0, job.attempts ?? 0) + 1;
  const maxAttempts = positiveInteger(input.maxAttempts);
  const exhausted = maxAttempts !== undefined && attempts >= maxAttempts;
  const nextAttemptAt = !exhausted && typeof input.retryBackoffMs === "number" && Number.isInteger(input.retryBackoffMs) && input.retryBackoffMs > 0
    ? new Date(failedAt.getTime() + input.retryBackoffMs).toISOString()
    : null;
  return input.routingRepository.saveJob({
    ...job,
    attempts,
    claimedAt: undefined,
    completedAt: undefined,
    deadLetteredAt: exhausted ? failedAt.toISOString() : undefined,
    lastError: typeof input.error === "string" ? input.error : input.error.message,
    nextAttemptAt,
    status: exhausted ? "dead_lettered" : "failed"
  });
}

export function applySlaTimerTransition(input: SlaTimerApplyWorkerInput): SlaTimerApplyWorkerResult {
  if (input.transition.status !== "ready") {
    return {
      conversationId: input.transition.conversationId,
      jobId: input.transition.jobId,
      status: "skipped"
    };
  }

  const transition = input.transition;
  const completedAt = (input.completedAt ?? new Date()).toISOString();
  const state = input.routingRepository.readState();
  const conversations = state.conversations.map((conversation) => {
    if (conversation.id !== transition.conversationId) {
      return conversation;
    }

    return {
      ...conversation,
      slaTone: transition.action === "resume_sla" ? "ok" as const : transition.toSlaTone,
      status: transition.toStatus
    };
  });
  const jobs = state.jobs.map((job) => job.id === transition.jobId
    ? { ...job, completedAt, status: "completed" }
    : job);

  input.routingRepository.saveState({
    ...state,
    conversations,
    jobs
  });

  return {
    conversationId: transition.conversationId,
    jobId: transition.jobId,
    ...(transition.action === "mark_sla_overdue"
      ? {
          overdueDescriptor: {
            conversationId: transition.conversationId,
            jobId: transition.jobId,
            kind: "sla.timer.overdue" as const,
            occurredAt: completedAt,
            queue: "sla-timers" as const
          },
          realtimeEvent: {
            data: {
              jobId: transition.jobId,
              state: "overdue" as const
            },
            occurredAt: completedAt,
            resourceId: transition.conversationId,
            resourceType: "conversation" as const,
            type: "sla.timer.updated" as const
          }
        }
      : {}),
    status: "applied"
  };
}

export function planSlaTimerTransition(input: SlaTimerTransitionInput): SlaTimerTransition {
  const action = input.job.action;
  if (input.job.queue !== "sla-timers") {
    return skippedTransition(input, "unsupported_queue");
  }
  if (action !== "resume_sla" && action !== "mark_sla_overdue") {
    return skippedTransition(input, "unsupported_action");
  }
  if (!isDue(input.job.runAt, input.now ?? new Date())) {
    return skippedTransition(input, "not_due");
  }

  if (action === "mark_sla_overdue") {
    if (input.conversation.status !== "active" && input.conversation.status !== "assigned") {
      return skippedTransition(input, "not_paused");
    }

    return {
      action: "mark_sla_overdue",
      conversationId: input.conversation.id,
      fromStatus: input.conversation.status,
      jobId: input.job.id,
      status: "ready",
      toSlaTone: "danger",
      toStatus: input.conversation.status
    };
  }

  if (input.conversation.status !== "paused") {
    return skippedTransition(input, "not_paused");
  }

  return {
    action: "resume_sla",
    conversationId: input.conversation.id,
    fromStatus: "paused",
    jobId: input.job.id,
    status: "ready",
    toStatus: "active"
  };
}

function skippedTransition(input: SlaTimerTransitionInput, reason: SlaTimerTransitionSkipped["reason"]): SlaTimerTransitionSkipped {
  return {
    action: input.job.action,
    conversationId: input.conversation.id,
    jobId: input.job.id,
    reason,
    status: "skipped"
  };
}

function isDue(runAt: RoutingJobDescriptor["runAt"], now: Date): boolean {
  if (runAt === undefined) {
    return true;
  }
  const dueAt = new Date(runAt).getTime();
  return Number.isFinite(dueAt) && dueAt <= now.getTime();
}

function isClaimableSlaTimerJob(job: RoutingJobDescriptor, now: Date): boolean {
  const status = job.status ?? "pending";
  if (status === "pending") {
    return isDue(job.runAt, now);
  }
  if (status === "failed") {
    return typeof job.nextAttemptAt === "string" && isDue(job.nextAttemptAt, now);
  }

  return false;
}

function compareJobDueAt(left: RoutingJobDescriptor, right: RoutingJobDescriptor): number {
  return jobDueAt(left) - jobDueAt(right);
}

function jobDueAt(job: RoutingJobDescriptor): number {
  if (job.runAt === undefined) {
    return 0;
  }
  const dueAt = new Date(job.runAt).getTime();
  return Number.isFinite(dueAt) ? dueAt : Number.POSITIVE_INFINITY;
}

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
