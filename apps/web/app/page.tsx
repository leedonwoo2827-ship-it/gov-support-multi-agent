"use client";
import { useEffect, useState, useCallback } from "react";
import SearchBar from "@/components/SearchBar";
import ProgramTable from "@/components/ProgramTable";
import ActionBar from "@/components/ActionBar";
import BoardGrid from "@/components/BoardGrid";
import { searchPrograms, runBulk, getCase, type PostRow } from "@/lib/api";
import type { Program, Case, SearchFilters } from "@gov/shared";

interface CaseRow {
  case: Case;
  program: Program;
  posts: PostRow[];
  runs: { agentId: string; status: string }[];
}

export default function HomePage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [total, setTotal] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [caseRows, setCaseRows] = useState<CaseRow[]>([]);

  const doSearch = useCallback(async (filters: Partial<SearchFilters>) => {
    const res = await searchPrograms(filters);
    setPrograms(res.programs);
    setTotal(res.total);
    setWarnings(res.warnings);
  }, []);

  useEffect(() => { doSearch({}); }, [doSearch]);

  // 케이스 폴링 (SSE 대신 단순화: 2초 간격)
  useEffect(() => {
    if (caseIds.length === 0) return;
    let stop = false;
    async function tick() {
      const rows = await Promise.all(caseIds.map(id => getCase(id)));
      if (stop) return;
      setCaseRows(rows.map(r => ({ case: r.case, program: r.program, posts: r.posts, runs: r.runs })));
      // 모두 완료면 폴링 중단
      const allDone = rows.every(r =>
        r.posts.length === 4 || r.runs.every((rn: any) => rn.status === "completed" || rn.status === "failed"),
      );
      if (allDone) { setRunning(false); return; }
      setTimeout(tick, 2000);
    }
    tick();
    return () => { stop = true; };
  }, [caseIds]);

  function toggle(id: string) {
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll(on: boolean) {
    setSelected(on ? new Set(programs.map(p => p.id)) : new Set());
  }

  async function analyze() {
    if (selected.size === 0) return;
    setRunning(true);
    const result = await runBulk(Array.from(selected));
    setCaseIds(result.cases.map(c => c.id));
    setSelected(new Set());
  }

  return (
    <div className="min-h-screen bg-gov-bg">
      <header className="bg-gov-blue text-white px-6 py-3 shadow">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold">정부지원사업 멀티에이전트 분석 대시보드</h1>
          <div className="text-xs opacity-80">회사: ㈜데모컴퍼니</div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-4">
        {warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-300 rounded p-3 mb-4 text-sm text-yellow-900">
            {warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <SearchBar onSearch={doSearch} />
          <div>
            <ProgramTable
              programs={programs}
              total={total}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
            />
            <ActionBar selectedCount={selected.size} running={running} onAnalyze={analyze} />
            <BoardGrid caseRows={caseRows} />
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-gray-400 py-6">
        gov-support-multi-agent · Claude API + node:sqlite + Hono + Next.js
      </footer>
    </div>
  );
}
