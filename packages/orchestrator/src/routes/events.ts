// SSE 라우트 — 케이스별 이벤트 실시간 스트리밍

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { subscribe } from "../lib/sse.js";
import { listEventsByCase } from "../board/events.js";

const router = new Hono();

router.get("/case/:id", (c) => {
  const caseId = c.req.param("id");
  return streamSSE(c, async (stream) => {
    // 1) 기존 이벤트 replay
    const existing = listEventsByCase(caseId, 0);
    for (const e of existing) {
      await stream.writeSSE({ event: e.kind, data: JSON.stringify(e), id: String(e.id) });
    }
    // 2) live 구독
    const queue: any[] = [];
    let resolveNext: (() => void) | null = null;
    const unsub = subscribe(caseId, (e) => {
      queue.push(e);
      resolveNext?.();
      resolveNext = null;
    });

    try {
      while (!stream.aborted) {
        if (queue.length === 0) {
          await new Promise<void>(r => { resolveNext = r; setTimeout(r, 30_000); });
        }
        while (queue.length > 0) {
          const e = queue.shift();
          await stream.writeSSE({ event: e.kind, data: JSON.stringify(e), id: String(e.id) });
        }
      }
    } finally {
      unsub();
    }
  });
});

router.get("/global", (c) => {
  return streamSSE(c, async (stream) => {
    const queue: any[] = [];
    let resolveNext: (() => void) | null = null;
    const unsub = subscribe(null, (e) => { queue.push(e); resolveNext?.(); resolveNext = null; });
    try {
      while (!stream.aborted) {
        if (queue.length === 0) {
          await new Promise<void>(r => { resolveNext = r; setTimeout(r, 30_000); });
        }
        while (queue.length > 0) {
          const e = queue.shift();
          await stream.writeSSE({ event: e.kind, data: JSON.stringify(e), id: String(e.id) });
        }
      }
    } finally {
      unsub();
    }
  });
});

export default router;
