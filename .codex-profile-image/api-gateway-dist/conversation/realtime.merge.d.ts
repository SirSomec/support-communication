import type { RealtimeEvent } from "./conversation.repository.js";
export declare function mergeRealtimeEvents(sources: RealtimeEvent[][], since?: string): RealtimeEvent[];
export declare function applyRealtimeCursor(events: RealtimeEvent[], since?: string): RealtimeEvent[];
export declare function compareRealtimeEvents(left: RealtimeEvent, right: RealtimeEvent): number;
