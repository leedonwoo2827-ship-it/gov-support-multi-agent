"use client";
import PostCard from "./PostCard";
import type { PostRow } from "@/lib/api";
import type { Case, Program } from "@gov/shared";

const AGENTS = [
  { id: "eligibility", label: "✅ 자격평가" },
  { id: "plan-draft", label: "📝 사업계획서" },
  { id: "doc-checklist", label: "📂 서류 체크리스트" },
  { id: "milestone", label: "📅 일정표" },
] as const;

interface CaseRow {
  case: Case;
  program: Program;
  posts: PostRow[];
  runs: { agentId: string; status: string }[];
}

interface Props {
  caseRows: CaseRow[];
}

export default function BoardGrid({ caseRows }: Props) {
  if (caseRows.length === 0) {
    return (
      <div className="gov-card p-12 text-center text-gray-500">
        <p>아직 분석된 케이스가 없습니다.</p>
        <p className="text-sm mt-2">위에서 공고를 선택하고 [전략 분석] 을 눌러주세요.</p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="font-semibold text-gov-blue text-lg">📌 게시판 — 에이전트 분석 결과</h2>
      {caseRows.map(({ case: kase, program, posts, runs }) => (
        <article key={kase.id} className="gov-card p-3">
          <header className="mb-3 pb-2 border-b border-gov-line">
            <h3 className="font-semibold">{program.title}</h3>
            <p className="text-xs text-gray-500">{program.agency} · 마감 {program.deadline ?? "상시"} · 케이스 {kase.id.slice(-8)}</p>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {AGENTS.map(a => {
              const post = posts.find(p => p.agentId === a.id);
              const run = runs.find(r => r.agentId === a.id);
              const status = (post ? "completed" : run?.status ?? "queued") as any;
              return (
                <PostCard
                  key={a.id}
                  post={post}
                  status={status}
                  agentLabel={a.label}
                  programTitle={program.title}
                  caseId={kase.id}
                />
              );
            })}
          </div>
        </article>
      ))}
    </section>
  );
}
