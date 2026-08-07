import { ApiOkResponse, ApiQuery, type OpenAPIObject } from "@nestjs/swagger";

type OpenApiComponents = NonNullable<OpenAPIObject["components"]>;
type SchemaObject = Exclude<NonNullable<OpenApiComponents["schemas"]>[string], { $ref: string }>;

export const PUBLIC_API_ENVIRONMENT_QUERY = {
  description: "Public API key environment. The value must match the key that is sent in Authorization.",
  enum: ["production", "stage"],
  name: "environment",
  required: false,
  schema: { default: "production", type: "string" }
} as const;

export const PUBLIC_API_ENVELOPE_SCHEMA: SchemaObject = {
  additionalProperties: true,
  properties: {
    data: { additionalProperties: true, type: "object" },
    error: {
      nullable: true,
      properties: {
        code: { example: "public_api_scope_denied", type: "string" },
        message: { type: "string" }
      },
      type: "object"
    },
    meta: { additionalProperties: true, type: "object" },
    operation: { type: "string" },
    service: { type: "string" },
    status: {
      enum: ["ok", "invalid", "denied", "unauthorized", "not_found", "conflict", "rate_limited", "failed"],
      type: "string"
    },
    traceId: { description: "Include this identifier when contacting support.", type: "string" }
  },
  required: ["service", "operation", "status", "data", "traceId"],
  type: "object"
};

const PUBLIC_SDK_ATTACHMENT_SCHEMA: SchemaObject = {
  properties: {
    fileId: { example: "file_019fdc87", type: "string" },
    fileName: { example: "order.pdf", maxLength: 255, type: "string" },
    mimeType: { example: "application/pdf", type: "string" },
    sizeBytes: { example: 245760, minimum: 0, type: "integer" }
  },
  required: ["fileId", "fileName"],
  type: "object"
};

export const PUBLIC_SDK_UPLOAD_BODY_SCHEMA: SchemaObject = {
  properties: {
    fileName: { example: "order.pdf", type: "string" },
    mimeType: { example: "application/pdf", type: "string" },
    sizeBytes: { example: 245760, minimum: 0, type: "integer" }
  },
  required: ["fileName"],
  type: "object"
};

export const PUBLIC_SDK_UPLOAD_FINALIZE_BODY_SCHEMA: SchemaObject = {
  properties: {
    checksum: { description: "Optional object checksum supplied by the storage workflow.", type: "string" }
  },
  type: "object"
};

export const PUBLIC_SDK_PRESENCE_BODY_SCHEMA: SchemaObject = {
  properties: {
    externalId: { example: "customer_42", type: "string" },
    pagePath: { example: "/orders/1024", type: "string" },
    pageUrl: { example: "https://shop.example/orders/1024", format: "uri", type: "string" },
    referrer: { example: "https://search.example/", format: "uri", type: "string" },
    sessionId: { description: "Stable browser-session identifier, up to 160 characters.", example: "session_d42f", type: "string" }
  },
  required: ["sessionId"],
  type: "object"
};

export const PUBLIC_SDK_PRESENCE_DISCONNECT_BODY_SCHEMA: SchemaObject = {
  properties: {
    sessionId: { description: "Stable browser-session identifier previously sent to heartbeat.", example: "session_d42f", type: "string" }
  },
  required: ["sessionId"],
  type: "object"
};

export const PUBLIC_SDK_INVITATION_ACK_BODY_SCHEMA: SchemaObject = {
  properties: {
    conversationId: { type: "string" },
    failureCode: { maxLength: 120, type: "string" },
    sessionId: { type: "string" }
  },
  required: ["sessionId"],
  type: "object"
};

export const PUBLIC_SDK_IDENTIFY_BODY_SCHEMA: SchemaObject = {
  properties: {
    externalId: { description: "Stable identifier from your application.", example: "customer_42", type: "string" },
    traits: {
      additionalProperties: true,
      description: "Non-sensitive client attributes. environment and tenantId are ignored.",
      example: { locale: "ru-RU", plan: "business" },
      type: "object"
    }
  },
  type: "object"
};

export const PUBLIC_SDK_MESSAGE_BODY_SCHEMA: SchemaObject = {
  properties: {
    attachments: { items: PUBLIC_SDK_ATTACHMENT_SCHEMA, type: "array" },
    conversationId: { description: "Existing conversation returned by identify or a previous message.", type: "string" },
    externalId: { description: "Required to create or resolve the visitor conversation.", example: "customer_42", type: "string" },
    offlineMessage: { default: false, description: "Emit an offline_message event webhook for this message.", type: "boolean" },
    pageUrl: { example: "https://shop.example/orders/1024", format: "uri", type: "string" },
    text: { example: "Подскажите статус заказа №1024", type: "string" }
  },
  required: ["externalId"],
  type: "object"
};

export const PUBLIC_SDK_CLIENT_INFO_BODY_SCHEMA: SchemaObject = {
  properties: {
    attributes: { additionalProperties: { oneOf: [{ type: "string" }, { type: "number" }] }, type: "object" },
    contactInfo: {
      properties: {
        description: { type: "string" },
        email: { format: "email", type: "string" },
        name: { type: "string" },
        phone: { type: "string" }
      },
      type: "object"
    },
    conversationId: { type: "string" },
    customData: {
      items: {
        properties: {
          content: { type: "string" },
          key: { type: "string" },
          link: { format: "uri", type: "string" },
          title: { type: "string" }
        },
        type: "object"
      },
      maxItems: 10,
      type: "array"
    },
    externalId: { example: "customer_42", type: "string" },
    pageTitle: { type: "string" },
    pageUrl: { format: "uri", type: "string" },
    userToken: { type: "string" }
  },
  required: ["externalId"],
  type: "object"
};

export const PUBLIC_SDK_RATING_BODY_SCHEMA: SchemaObject = {
  properties: {
    idempotencyKey: { description: "Required stable key, up to 200 characters.", example: "rating-order-1024", type: "string" },
    scale: { enum: ["CSAT", "CSI"], example: "CSAT", type: "string" },
    score: { example: 5, maximum: 5, minimum: 1, type: "integer" },
    visitorSessionToken: { description: "Short-lived token returned by the message or polling endpoint.", type: "string" }
  },
  required: ["idempotencyKey", "scale", "score", "visitorSessionToken"],
  type: "object"
};

export const PUBLIC_SDK_SESSION_TOKEN_BODY_SCHEMA: SchemaObject = {
  properties: {
    visitorSessionToken: { description: "Short-lived token returned by the message or polling endpoint.", type: "string" }
  },
  required: ["visitorSessionToken"],
  type: "object"
};

export const PUBLIC_DEMO_REQUEST_BODY_SCHEMA: SchemaObject = {
  properties: {
    company: { example: "Acme Retail", type: "string" },
    consent: { example: true, type: "boolean" },
    email: { example: "owner@example.com", format: "email", type: "string" },
    message: { example: "Нужна демонстрация для команды поддержки.", type: "string" },
    name: { example: "Анна Петрова", type: "string" },
    planInterest: { type: "string" },
    source: { example: "landing-hero", type: "string" },
    website: { description: "Spam-protection honeypot; clients must leave it empty.", type: "string" }
  },
  required: ["name", "company", "email", "message", "consent"],
  type: "object"
};

const OPEN_CHANNEL_GEO_SCHEMA: SchemaObject = {
  properties: {
    city: { type: "string" },
    country: { type: "string" },
    countryCode: { type: "string" },
    latitude: { type: "number" },
    longitude: { type: "number" },
    organization: { type: "string" },
    region: { type: "string" },
    regionCode: { type: "string" },
    source: { enum: ["geoip", "location_message", "provider"], type: "string" }
  },
  type: "object"
};

const OPEN_CHANNEL_USER_SCHEMA: SchemaObject = {
  properties: {
    crm_link: { format: "uri", type: "string" },
    custom_data: { type: "string" },
    email: { format: "email", type: "string" },
    geo: OPEN_CHANNEL_GEO_SCHEMA,
    group: { type: "string" },
    id: { example: "customer_42", maxLength: 255, type: "string" },
    intent: { type: "string" },
    invite: { type: "string" },
    name: { example: "Анна Петрова", type: "string" },
    phone: { type: "string" },
    photo: { format: "uri", type: "string" },
    title: { type: "string" },
    url: { format: "uri", type: "string" }
  },
  type: "object"
};

export const OPEN_CHANNEL_EVENT_BODY_SCHEMA: SchemaObject = {
  properties: {
    message: {
      properties: {
        city: { type: "string" },
        country: { type: "string" },
        date: { description: "Unix timestamp in seconds.", example: 1760860800, type: "integer" },
        file: { format: "uri", type: "string" },
        file_name: { type: "string" },
        file_size: { minimum: 0, type: "integer" },
        height: { minimum: 0, type: "integer" },
        id: { description: "Provider message id used for deduplication.", example: "msg_1024", type: "string" },
        keyboard: { items: { additionalProperties: true, type: "object" }, maxItems: 7, type: "array" },
        latitude: { type: "number" },
        longitude: { type: "number" },
        mime_type: { type: "string" },
        multiple: { type: "boolean" },
        text: { example: "Нужна помощь с заказом", type: "string" },
        thumb: { format: "uri", type: "string" },
        title: { type: "string" },
        type: {
          enum: ["text", "photo", "sticker", "video", "audio", "document", "location", "rate", "seen", "keyboard", "typein", "start", "stop"],
          type: "string"
        },
        value: { type: "number" },
        width: { minimum: 0, type: "integer" }
      },
      required: ["type"],
      type: "object"
    },
    recipient: OPEN_CHANNEL_USER_SCHEMA,
    sender: { ...OPEN_CHANNEL_USER_SCHEMA, required: ["id"] }
  },
  required: ["sender", "message"],
  type: "object"
};

export const YOOKASSA_WEBHOOK_BODY_SCHEMA: SchemaObject = {
  additionalProperties: true,
  properties: {
    object: {
      additionalProperties: true,
      properties: { id: { description: "YooKassa payment object identifier.", type: "string" } },
      required: ["id"],
      type: "object"
    }
  },
  required: ["object"],
  type: "object"
};

export function ApiPublicEnvironment() {
  return ApiQuery(PUBLIC_API_ENVIRONMENT_QUERY);
}

export function ApiPublicEnvelope(description: string) {
  return ApiOkResponse({ description, schema: PUBLIC_API_ENVELOPE_SCHEMA });
}
