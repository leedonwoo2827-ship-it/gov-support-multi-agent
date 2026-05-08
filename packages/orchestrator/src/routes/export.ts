// 다운로드 라우트 — gov.db / programs.csv / posts.csv / case.{json,md}

import { Hono } from "hono";
import Papa from "papaparse";
import { readFileSync } from "node:fs";
import { listAllPrograms } from "../board/programs.js";
import { listPosts, listPostsByCase } from "../board/posts.js";
import { getCase } from "../board/cases.js";
import { getProgram } from "../board/programs.js";
import { getProfile } from "../board/profiles.js";

const router = new Hono();

router.get("/db", (c) => {
  const path = process.env.DB_PATH ?? "./data/gov.db";
  try {
    const buf = readFileSync(path);
    return new Response(buf, {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="gov.db"`,
      },
    });
  } catch (err) {
    return c.json({ error: `DB 파일 읽기 실패: ${(err as Error).message}` }, 500);
  }
});

router.get("/programs/csv", (c) => {
  const programs = listAllPrograms();
  const flat = programs.map(p => ({
    id: p.id, source: p.source, programId: p.programId, title: p.title,
    agency: p.agency, region: p.region, industry: p.industry, field: p.field,
    deadline: p.deadline, url: p.url, summary: p.summary,
  }));
  const csv = Papa.unparse(flat);
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="programs-${today()}.csv"`,
    },
  });
});

router.get("/posts/csv", (c) => {
  const posts = listPosts({ limit: 10_000 });
  const flat = posts.map(p => ({
    id: p.id, caseId: p.caseId, agentId: p.agentId, title: p.title,
    createdAt: p.createdAt,
    payload_summary: summarize(p.payload),
  }));
  const csv = Papa.unparse(flat);
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="posts-${today()}.csv"`,
    },
  });
});

router.get("/cases/:id/json", (c) => {
  const id = c.req.param("id");
  const kase = getCase(id);
  if (!kase) return c.json({ error: "케이스 없음" }, 404);
  return c.json({
    case: kase,
    program: getProgram(kase.programId),
    profile: getProfile(kase.companyProfileId),
    posts: listPostsByCase(id),
  });
});

router.get("/cases/:id/md", (c) => {
  const id = c.req.param("id");
  const kase = getCase(id);
  if (!kase) return c.json({ error: "케이스 없음" }, 404);
  const program = getProgram(kase.programId);
  const profile = getProfile(kase.companyProfileId);
  const posts = listPostsByCase(id);

  const md = [
    `# ${program?.title ?? "(공고 없음)"} — 멀티에이전트 분석 보고서`,
    ``,
    `- 회사: ${profile?.companyName ?? "(미정)"}`,
    `- 공고 ID: ${kase.programId}`,
    `- 마감: ${program?.deadline ?? "상시"}`,
    `- 케이스 ID: ${id}`,
    `- 생성: ${kase.createdAt}`,
    ``,
    `---`,
    ``,
    ...posts.map(p => [
      `## ${p.title}`,
      ``,
      `> 에이전트: ${p.agentId} · 생성: ${p.createdAt}`,
      ``,
      p.bodyMd,
      ``,
    ].join("\n")),
  ].join("\n");

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="case-${id}.md"`,
    },
  });
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function summarize(p: unknown): string {
  const json = JSON.stringify(p);
  return json.length > 500 ? json.slice(0, 500) + "..." : json;
}

export default router;
