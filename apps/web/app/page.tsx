"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import ProgramTable from "@/components/ProgramTable";
import ProgramTableOda from "@/components/ProgramTableOda";
import ActionBar from "@/components/ActionBar";
import BoardGrid from "@/components/BoardGrid";
import DepartmentTabs from "@/components/DepartmentTabs";
import { searchPrograms, runBulk, getCase, type PostRow } from "@/lib/api";
import { DEPARTMENT_LABELS, isDepartment } from "@/lib/department";
import type { Program, Case, SearchFilters, Department } from "@gov/shared";

interface CaseRow {
  case: Case;
  program: Program;
  posts: PostRow[];
  runs: { agentId: string; status: string }[];
}

const DEPT_STORAGE_KEY = "gov-pa.department";

function getInitialDept(): Department {
  if (typeof window === "undefined") return "planning";
  const sp = new URLSearchParams(window.location.search);
  const fromUrl = sp.get("dept");
  if (isDepartment(fromUrl)) return fromUrl;
  const fromStorage = window.localStorage.getItem(DEPT_STORAGE_KEY);
  if (isDepartment(fromStorage)) return fromStorage;
  return "planning";
}

export default function HomePage() {
  const [department, setDepartment] = useState<Department>("planning");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [total, setTotal] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [caseRows, setCaseRows] = useState<CaseRow[]>([]);

  // 부서 초기값 — 마운트 후 URL/localStorage 에서 복원
  useEffect(() => { setDepartment(getInitialDept()); }, []);

  // 부서 변경 시 URL/localStorage 동기화 + 검색 결과 초기화
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    sp.set("dept", department);
    const next = `${window.location.pathname}?${sp.toString()}`;
    window.history.replaceState(null, "", next);
    window.localStorage.setItem(DEPT_STORAGE_KEY, department);
  }, [department]);

  const doSearch = useCallback(async (filters: Partial<SearchFilters>) => {
    const res = await searchPrograms({ ...filters, department });
    setPrograms(res.programs);
    setTotal(res.total);
    setWarnings(res.warnings);
    setSelected(new Set());
  }, [department]);

  useEffect(() => { doSearch({}); }, [doSearch]);

  // 케이스 폴링 (2초)
  useEffect(() => {
    if (caseIds.length === 0) return;
    let stop = false;
    async function tick() {
      const rows = await Promise.all(caseIds.map(id => getCase(id)));
      if (stop) return;
      setCaseRows(rows.map(r => ({ case: r.case, program: r.program, posts: r.posts, runs: r.runs })));
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
    const result = await runBulk(Array.from(selected), department);
    setCaseIds(result.cases.map(c => c.id));
    setSelected(new Set());
  }

  // 현 부서 케이스만 표시 (다른 부서 분석은 DB 에는 남지만 화면에서 숨김)
  const visibleCaseRows = caseRows.filter(r => !r.case.department || r.case.department === department);
  const deptLabel = DEPARTMENT_LABELS[department];

  return (
    <div className="min-h-screen bg-gov-bg">
      <header className="bg-gov-blue text-white px-6 py-3 shadow">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold">정부지원사업 멀티에이전트 분석 대시보드</h1>
          <div className="flex items-center gap-4 text-xs opacity-90">
            <span>{deptLabel.emoji} {deptLabel.short}</span>
            <Link href="/settings" className="underline hover:opacity-100">⚙️ 설정</Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-4">
        <DepartmentTabs value={department} onChange={setDepartment} />

        {warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-300 rounded p-3 mb-4 text-sm text-yellow-900">
            {warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <SearchBar onSearch={doSearch} placeholderKeyword={deptLabel.placeholderKeyword} />
          <div>
            {department === "oda" ? (
              <ProgramTableOda
                programs={programs}
                total={total}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
              />
            ) : (
              <ProgramTable
                programs={programs}
                total={total}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
              />
            )}
            <ActionBar selectedCount={selected.size} running={running} onAnalyze={analyze} />
            <BoardGrid caseRows={visibleCaseRows} />
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-gray-400 py-6">
        gov-support-multi-agent · Claude API + node:sqlite + Hono + Next.js
      </footer>
    </div>
  );
}
