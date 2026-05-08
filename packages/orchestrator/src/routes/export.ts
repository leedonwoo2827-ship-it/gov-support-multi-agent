// 다운로드 라우트 — gov.db / programs.csv / posts.csv / case.{json,md,html} / 개별 post.{md,html}

import { Hono } from "hono";
import Papa from "papaparse";
import { marked } from "marked";
import { readFileSync } from "node:fs";
import { listAllPrograms } from "../board/programs.js";
import { listPosts, listPostsByCase, getPost } from "../board/posts.js";
import { getCase } from "../board/cases.js";
import { getProgram } from "../board/programs.js";
import { getProfile } from "../board/profiles.js";

// HTML 렌더 — 인쇄/PDF 친화 스타일
function renderHtml(title: string, bodyMd: string): string {
  const bodyHtml = marked.parse(bodyMd) as string;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: 'Pretendard', system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; line-height: 1.7; color: #1a1a1a; background: white; }
  h1 { font-size: 26px; border-bottom: 2px solid #003478; padding-bottom: 10px; margin-top: 32px; }
  h2 { font-size: 20px; margin-top: 28px; padding-top: 8px; border-top: 1px solid #eee; }
  h3 { font-size: 16px; margin-top: 20px; color: #003478; }
  h4 { font-size: 14px; margin-top: 16px; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; }
  th, td { border: 1px solid #d0d7de; padding: 8px 12px; text-align: left; vertical-align: top; }
  th { background: #f3f6fa; font-weight: 600; }
  blockquote { border-left: 4px solid #0073e6; padding: 8px 14px; margin: 14px 0; background: #f0f7ff; color: #1a3a5c; }
  code { background: #f3f4f6; padding: 1px 6px; border-radius: 3px; font-size: 13px; }
  pre { background: #f6f8fa; padding: 14px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
  ul, ol { padding-left: 24px; }
  li { margin: 4px 0; }
  hr { border: 0; border-top: 1px dashed #ccc; margin: 32px 0; }
  .meta { color: #6a737d; font-size: 13px; margin-bottom: 8px; }
  .actions { margin: 20px 0; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; }
  .actions button { background: #003478; color: white; border: 0; padding: 6px 14px; border-radius: 4px; cursor: pointer; margin-right: 8px; font-family: inherit; }
  .actions button:hover { background: #0073e6; }
  @media print {
    .actions { display: none; }
    body { margin: 0; padding: 16mm; max-width: none; }
    h1, h2, h3 { page-break-after: avoid; }
    table, blockquote, pre { page-break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
<div class="actions">
  💡 PDF 로 저장하려면 <kbd>Ctrl</kbd>+<kbd>P</kbd> (Mac: <kbd>⌘</kbd>+<kbd>P</kbd>) → 인쇄 대화상자에서 "PDF 로 저장" 선택.
  &nbsp;<button onclick="window.print()">🖨 인쇄 / PDF 저장</button>
</div>
${bodyHtml}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

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

// 개별 게시글 — 한 에이전트 결과만 단독 마크다운
router.get("/posts/:id/md", (c) => {
  const id = c.req.param("id");
  const post = getPost(id);
  if (!post) return c.json({ error: "게시글 없음" }, 404);
  const md = [
    `# ${post.title}`,
    ``,
    `> 에이전트: ${post.agentId} · 케이스: ${post.caseId} · 생성: ${post.createdAt}`,
    ``,
    `---`,
    ``,
    post.bodyMd,
    ``,
    `---`,
    ``,
    `## 구조화 페이로드 (JSON)`,
    ``,
    "```json",
    JSON.stringify(post.payload, null, 2),
    "```",
    ``,
  ].join("\n");
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${post.agentId}-${post.id}.md"`,
    },
  });
});

function buildCaseMarkdown(id: string): string | null {
  const kase = getCase(id);
  if (!kase) return null;
  const program = getProgram(kase.programId);
  const profile = getProfile(kase.companyProfileId);
  const posts = listPostsByCase(id);

  return [
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
}

router.get("/cases/:id/md", (c) => {
  const id = c.req.param("id");
  const md = buildCaseMarkdown(id);
  if (!md) return c.json({ error: "케이스 없음" }, 404);
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="case-${id}.md"`,
    },
  });
});

// 케이스 통합 — 인쇄 친화 HTML (Ctrl+P → PDF)
router.get("/cases/:id/html", (c) => {
  const id = c.req.param("id");
  const md = buildCaseMarkdown(id);
  if (!md) return c.json({ error: "케이스 없음" }, 404);
  const kase = getCase(id);
  const title = `case-${id} 멀티에이전트 분석 보고서`;
  const html = renderHtml(title, md);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
});

// 개별 게시글 — 인쇄 친화 HTML
router.get("/posts/:id/html", (c) => {
  const id = c.req.param("id");
  const post = getPost(id);
  if (!post) return c.json({ error: "게시글 없음" }, 404);
  const md = [
    `# ${post.title}`,
    ``,
    `> 에이전트: ${post.agentId} · 생성: ${post.createdAt}`,
    ``,
    post.bodyMd,
  ].join("\n");
  const html = renderHtml(post.title, md);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function summarize(p: unknown): string {
  const json = JSON.stringify(p);
  return json.length > 500 ? json.slice(0, 500) + "..." : json;
}

export default router;
