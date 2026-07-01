export interface RoutingOperator {
  avgFirstResponseSeconds: number;
  channels: string[];
  chats: number;
  id: string;
  limit: number;
  name: string;
  rescueActive: number;
  slaPercent: number;
  status: "break" | "offline" | "online";
}

export interface RoutingQueue {
  active: number;
  channel: string;
  health: number;
  limit: number;
  overdue: number;
  waiting: number;
}

export interface RoutingRescueState {
  deadlineAt: number;
  durationSeconds: number;
  nextAction: string;
  reason: string;
  source: string;
  startedAt: number;
  state: "active" | "missed" | "returned_to_queue" | "saved";
}

export interface RoutingConversation {
  channel: string;
  client: string;
  id: string;
  operatorId?: string;
  rescue?: RoutingRescueState;
  slaTone: "closed" | "danger" | "hold" | "ok" | "warn";
  status: "active" | "assigned" | "closed" | "paused" | "queued" | "transferred";
  topic?: string;
}

export interface RescueReportRow {
  channel: string;
  conversationId: string;
  digest: string;
  operatorId: string | null;
  outcome: string;
  reason: string;
  resolution: string;
  timerSeconds: number;
}

export const routingOperatorFixtures: RoutingOperator[] = [
  {
    id: "operator-ivan",
    name: "Ivan P.",
    status: "online",
    chats: 7,
    limit: 12,
    avgFirstResponseSeconds: 78,
    slaPercent: 96,
    rescueActive: 1,
    channels: ["SDK", "Telegram"]
  },
  {
    id: "operator-anna",
    name: "Anna R.",
    status: "online",
    chats: 10,
    limit: 12,
    avgFirstResponseSeconds: 102,
    slaPercent: 91,
    rescueActive: 0,
    channels: ["MAX", "VK"]
  },
  {
    id: "operator-kirill",
    name: "Kirill M.",
    status: "break",
    chats: 3,
    limit: 8,
    avgFirstResponseSeconds: 131,
    slaPercent: 88,
    rescueActive: 1,
    channels: ["Telegram"]
  },
  {
    id: "operator-elena",
    name: "Elena S.",
    status: "online",
    chats: 5,
    limit: 10,
    avgFirstResponseSeconds: 65,
    slaPercent: 98,
    rescueActive: 0,
    channels: ["SDK"]
  },
  {
    id: "operator-oleg",
    name: "Oleg N.",
    status: "offline",
    chats: 0,
    limit: 8,
    avgFirstResponseSeconds: 200,
    slaPercent: 82,
    rescueActive: 0,
    channels: ["VK"]
  },
  {
    id: "operator-full",
    name: "Full VK Operator",
    status: "online",
    chats: 8,
    limit: 8,
    avgFirstResponseSeconds: 144,
    slaPercent: 83,
    rescueActive: 2,
    channels: ["VK"]
  }
];

export const routingQueueFixtures: RoutingQueue[] = [
  { channel: "SDK", active: 42, waiting: 8, overdue: 2, limit: 12, health: 82 },
  { channel: "Telegram", active: 35, waiting: 11, overdue: 3, limit: 8, health: 74 },
  { channel: "MAX", active: 24, waiting: 5, overdue: 1, limit: 8, health: 89 },
  { channel: "VK", active: 25, waiting: 9, overdue: 4, limit: 8, health: 68 }
];

export const routingConversationFixtures: RoutingConversation[] = [
  {
    id: "vladimir",
    client: "Vladimir B.",
    channel: "Telegram",
    operatorId: "operator-kirill",
    status: "assigned",
    slaTone: "danger",
    topic: "Delivery / Status"
  },
  {
    id: "maria",
    client: "Maria K.",
    channel: "SDK",
    operatorId: "operator-ivan",
    status: "active",
    slaTone: "ok",
    topic: "Delivery / Status"
  },
  {
    id: "alexey",
    client: "Alexey T.",
    channel: "VK",
    status: "queued",
    slaTone: "danger",
    topic: "Authorization / Code"
  },
  {
    id: "closed-dialog",
    client: "Closed Client",
    channel: "SDK",
    operatorId: "operator-elena",
    status: "closed",
    slaTone: "closed",
    topic: "Payment / Refund"
  }
];

export const rescueReportSeedRows: RescueReportRow[] = [
  {
    conversationId: "rescue-vk-queue",
    channel: "VK",
    operatorId: null,
    timerSeconds: 0,
    reason: "Queue overloaded, SLA 68%",
    outcome: "missed",
    resolution: "Timer expired before redistribution",
    digest: "daily_rescue"
  },
  {
    conversationId: "rescue-olga",
    channel: "SDK",
    operatorId: "operator-ivan",
    timerSeconds: 78,
    reason: "Low previous CSAT",
    outcome: "saved",
    resolution: "Senior reviewed answer before close",
    digest: "quality_digest"
  }
];
