// 케이스별 in-process EventEmitter 허브 → SSE

import { EventEmitter } from "node:events";
import type { BoardEvent } from "@gov/shared";

const hubs = new Map<string, EventEmitter>();
const GLOBAL_KEY = "__global__";

function getHub(caseId: string): EventEmitter {
  let h = hubs.get(caseId);
  if (!h) {
    h = new EventEmitter();
    h.setMaxListeners(50);
    hubs.set(caseId, h);
  }
  return h;
}

export function publish(caseId: string | null, event: BoardEvent): void {
  if (caseId) getHub(caseId).emit("event", event);
  getHub(GLOBAL_KEY).emit("event", event);
}

export function subscribe(
  caseId: string | null,
  handler: (e: BoardEvent) => void,
): () => void {
  const key = caseId ?? GLOBAL_KEY;
  const hub = getHub(key);
  hub.on("event", handler);
  return () => hub.off("event", handler);
}
