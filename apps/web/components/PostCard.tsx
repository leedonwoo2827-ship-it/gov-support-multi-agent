"use client";
import { useState } from "react";
import type { PostRow } from "@/lib/api";

interface Props {
  post?: PostRow;
  status: "queued" | "running" | "completed" | "failed";
  agentLabel: string;
  programTitle: string;
  caseId: string;
}

const AGENT_EMOJI: Record<string, string> = {
  eligibility: "✅",
  "plan-draft": "📝",
  "doc-checklist": "📂",
  milestone: "📅",
};

export default function PostCard({ post, status, agentLabel, programTitle }: Props) {
  const [open, setOpen] = useState(false);

  const statusLabel = {
    queued: "대기",
    running: "실행 중",
    completed: "완료",
    failed: "실패",
  }[status];

  return (
    <div className="gov-card p-3">
      <header className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">{agentLabel}</h3>
        <span className={`status-pill status-${status}`}>{statusLabel}</span>
      </header>
      <p className="text-xs text-gray-700 line-clamp-1 mb-2">{programTitle}</p>
      {post ? (
        <>
          <div className="text-xs text-gray-600 mb-2">
            {summarize(post)}
          </div>
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs text-gov-accent hover:underline"
          >
            {open ? "▲ 접기" : "▼ 상세보기"}
          </button>
          {open && (
            <div className="mt-3 prose prose-sm max-w-none border-t border-gov-line pt-3">
              <pre className="whitespace-pre-wrap text-xs leading-relaxed bg-gray-50 p-3 rounded overflow-x-auto">{post.bodyMd}</pre>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-gray-400">{status === "running" ? "분석 진행 중..." : "대기 중"}</p>
      )}
    </div>
  );
}

function summarize(p: PostRow): string {
  switch (p.agentId) {
    case "eligibility": {
      const v = p.payload;
      return `${v.verdict} · ${v.score}점 · 충족 ${v.matchedCriteria.length}/미충족 ${v.unmetCriteria.length}`;
    }
    case "plan-draft": {
      const v = p.payload;
      return `PSST 4섹션 · ${v.wordCount}자`;
    }
    case "doc-checklist": {
      const v = p.payload;
      return `필수 ${v.required.length}건 · 선택 ${v.optional.length}건`;
    }
    case "milestone": {
      const v = p.payload;
      return `${v.totalDays}일 · ${v.milestones.length}단계`;
    }
  }
}
