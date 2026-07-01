import type { RoutingJobDescriptor, RoutingRepository } from "./routing.repository.js";

interface RescueReturnClaimWorkerInput {
  limit?: number;
  now?: Date;
  routingRepository: Pick<RoutingRepository, "listJobs" | "saveJob">;
}

interface RescueReturnApplyWorkerInput {
  completedAt?: Date;
  job: RoutingJobDescriptor;
  routingRepository: Pick<RoutingRepository, "readState" | "saveState">;
}

interface RescueReturnClaimWorkerResult {
  claimed: RoutingJobDescriptor[];
}

interface RescueReturnApplyWorkerResult {
  analyticsDescriptor?: {
    channel: string;
    conversationId: string;
    jobId: string;
    kind: "routing.rescue.auto_returned";
    occurredAt: string;
    operatorId: string | null;
  };
  conversationId: string | null;
  jobId: string;
  reason?: "conversation_not_found" | "job_not_claimed" | "missing_conversation_id" | "not_active_rescue" | "unsupported_action" | "unsupported_queue";
  realtimeEvent?: {
    data: {
      jobId: string;
      state: "returned_to_queue";
    };
    occurredAt: string;
    resourceId: string;
    resourceType: "conversation";
    type: "rescue.countdown.updated";
  };
  status: "applied" | "skipped";
}

export function claimExpiredRescueReturnJobs(input: RescueReturnClaimWorkerInput): RescueReturnClaimWorkerResult {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.trunc(input.limit ?? 1));
  const dueJobs = input.routingRepository.listJobs()
    .filter((job) => isClaimableRescueReturnJob(job, now))
    .sort(compareJobDueAt)
    .slice(0, limit);

  const claimed = dueJobs.flatMap((job) => {
    const current = input.routingRepository.listJobs().find((item) => item.id === job.id);
    if (!current || !isClaimableRescueReturnJob(current, now)) {
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

export function applyRescueReturnTransition(input: RescueReturnApplyWorkerInput): RescueReturnApplyWorkerResult {
  const state = input.routingRepository.readState();
  const currentJob = state.jobs.find((job) => job.id === input.job.id);
  const conversationId = typeof (currentJob ?? input.job).conversationId === "string" ? (currentJob ?? input.job).conversationId! : null;
  if (!currentJob) {
    return {
      conversationId,
      jobId: input.job.id,
      reason: "job_not_claimed",
      status: "skipped"
    };
  }
  if (currentJob.queue !== "rescue-return") {
    return {
      conversationId,
      jobId: input.job.id,
      reason: "unsupported_queue",
      status: "skipped"
    };
  }
  if (currentJob.action !== "return_to_sla_queue") {
    return {
      conversationId,
      jobId: input.job.id,
      reason: "unsupported_action",
      status: "skipped"
    };
  }
  if (!conversationId) {
    return {
      conversationId,
      jobId: input.job.id,
      reason: "missing_conversation_id",
      status: "skipped"
    };
  }

  const completedAt = (input.completedAt ?? new Date()).toISOString();
  if (currentJob?.status !== "claimed") {
    return {
      conversationId,
      jobId: input.job.id,
      reason: "job_not_claimed",
      status: "skipped"
    };
  }

  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    return {
      conversationId,
      jobId: input.job.id,
      reason: "conversation_not_found",
      status: "skipped"
    };
  }
  if (conversation.rescue?.state !== "active") {
    return {
      conversationId,
      jobId: input.job.id,
      reason: "not_active_rescue",
      status: "skipped"
    };
  }

  const previousOperatorId = conversation.operatorId ?? null;
  const rescue = conversation.rescue;
  input.routingRepository.saveState({
    ...state,
    conversations: state.conversations.map((item) => item.id === conversationId
      ? {
          ...item,
          operatorId: undefined,
          rescue: {
            ...item.rescue!,
            state: "returned_to_queue" as const
          },
          slaTone: "hold" as const,
          status: "queued" as const
        }
      : item),
    jobs: state.jobs.map((job) => job.id === input.job.id
      ? {
          ...job,
          completedAt,
          status: "completed"
        }
      : job),
    operators: state.operators.map((operator) => operator.id === previousOperatorId
      ? {
          ...operator,
          chats: Math.max(0, operator.chats - 1),
          rescueActive: Math.max(0, operator.rescueActive - 1)
        }
      : operator),
    queues: state.queues.map((queue) => queue.channel === conversation.channel
      ? {
          ...queue,
          active: Math.max(0, queue.active - 1),
          waiting: queue.waiting + 1
        }
      : queue),
    rescueReportRows: [
      ...state.rescueReportRows,
      {
        channel: conversation.channel,
        conversationId,
        digest: "daily_rescue",
        operatorId: previousOperatorId,
        outcome: "returned_to_queue",
        reason: rescue.reason,
        resolution: "Auto-returned to SLA queue after rescue timer expired",
        timerSeconds: rescue.durationSeconds
      }
    ],
    routingAnalyticsRows: [
      ...state.routingAnalyticsRows,
      {
        channel: conversation.channel,
        conversationId,
        eventKind: "auto_return",
        fromOperatorId: previousOperatorId,
        id: `analytics_auto_return_${input.job.id}`,
        occurredAt: completedAt,
        source: "rescue-return-worker",
        tenantId: "tenant-volga",
        toOperatorId: null
      }
    ]
  });

  return {
    analyticsDescriptor: {
      channel: conversation.channel,
      conversationId,
      jobId: input.job.id,
      kind: "routing.rescue.auto_returned",
      occurredAt: completedAt,
      operatorId: previousOperatorId
    },
    conversationId,
    jobId: input.job.id,
    realtimeEvent: {
      data: {
        jobId: input.job.id,
        state: "returned_to_queue"
      },
      occurredAt: completedAt,
      resourceId: conversationId,
      resourceType: "conversation",
      type: "rescue.countdown.updated"
    },
    status: "applied"
  };
}

function isDue(runAt: RoutingJobDescriptor["runAt"], now: Date): boolean {
  if (runAt === undefined) {
    return true;
  }
  const dueAt = new Date(runAt).getTime();
  return Number.isFinite(dueAt) && dueAt <= now.getTime();
}

function isClaimableRescueReturnJob(job: RoutingJobDescriptor, now: Date): boolean {
  return job.queue === "rescue-return"
    && job.action === "return_to_sla_queue"
    && (job.status ?? "pending") === "pending"
    && isDue(job.runAt, now);
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
