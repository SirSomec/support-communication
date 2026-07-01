import { createEnvelope } from "@support-communication/envelope";
import type { ConversationService } from "../conversation/conversation.service.js";
import {
  createVerifiedInboundWebhookNormalizationDescriptor,
  type SignedWebhookNonceStore
} from "./signed-webhook-verifier.js";

export interface SignedInboundWebhookRouteInput {
  body: string;
  channel: string;
  conversationService: Pick<ConversationService, "normalizeInboundEvent">;
  endpointId: string;
  headers?: Record<string, string | undefined>;
  nonceStore: SignedWebhookNonceStore;
  now: string;
  secret: string;
}

export async function normalizeSignedInboundWebhookFromRoute(input: SignedInboundWebhookRouteInput) {
  const descriptorResult = await createVerifiedInboundWebhookNormalizationDescriptor({
    body: input.body,
    channel: input.channel,
    endpointId: input.endpointId,
    nonceHeader: input.headers?.["x-webhook-nonce"],
    now: input.now,
    secret: input.secret,
    signatureHeader: input.headers?.["x-webhook-signature"],
    store: input.nonceStore,
    timestampHeader: input.headers?.["x-webhook-timestamp"]
  });

  if (!descriptorResult.accepted) {
    return createEnvelope({
      service: "integrationService",
      operation: "receiveSignedInboundWebhook",
      status: "denied",
      meta: {
        channel: input.channel,
        endpointId: input.endpointId,
        source: "webhook"
      },
      data: {
        ...(descriptorResult.replay
          ? {
              endpointId: descriptorResult.replay.endpointId,
              firstSeenAt: descriptorResult.replay.firstSeenAt,
              nonce: descriptorResult.replay.nonce,
              replay: true
            }
          : {}),
        normalizationDescriptor: null
      },
      error: {
        code: descriptorResult.code,
        message: signedWebhookErrorMessage(descriptorResult.code)
      }
    });
  }

  const normalized = await input.conversationService.normalizeInboundEvent(
    descriptorResult.descriptor.channel,
    descriptorResult.descriptor.normalizationPayload
  );
  if (normalized.data.duplicate === true) {
    return createEnvelope({
      service: "integrationService",
      operation: "receiveSignedInboundWebhook",
      status: "conflict",
      meta: {
        channel: input.channel,
        endpointId: input.endpointId,
        source: "webhook"
      },
      data: {
        duplicate: true,
        eventId: descriptorResult.descriptor.normalizationPayload.eventId,
        normalizationDescriptor: descriptorResult.descriptor
      },
      error: {
        code: "webhook_event_already_processed",
        message: "Signed webhook event has already been processed."
      }
    });
  }

  return {
    ...normalized,
    data: {
      ...normalized.data,
      normalizationDescriptor: descriptorResult.descriptor
    }
  };
}

function signedWebhookErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    webhook_nonce_replay: "Signed webhook nonce has already been processed.",
    webhook_nonce_required: "Signed webhook nonce is required.",
    webhook_payload_malformed: "Signed webhook payload is malformed.",
    webhook_signature_malformed: "Signed webhook signature is malformed.",
    webhook_signature_mismatch: "Signed webhook signature does not match the payload.",
    webhook_signature_required: "Signed webhook signature is required.",
    webhook_timestamp_malformed: "Signed webhook timestamp is malformed.",
    webhook_timestamp_outside_tolerance: "Signed webhook timestamp is outside the allowed tolerance.",
    webhook_timestamp_required: "Signed webhook timestamp is required."
  };

  return messages[code] ?? "Signed webhook request was rejected.";
}
