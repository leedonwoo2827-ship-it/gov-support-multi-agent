"use client";
import { useMemo } from "react";
import type { Program } from "@gov/shared";

interface Props {
  programs: Program[];
  total: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (select: boolean) => void;
}

export default function ProgramTable({ programs, total, selected, onToggle, onToggleAll }: Props) {
  const allSelected = useMemo(() => programs.length > 0 && programs.every(p => selected.has(p.id)), [programs, selected]);

  return (
    <div className="gov-card overflow-hidden">
      <header className="px-4 py-2 border-b border-gov-line flex items-center justify-between bg-gray-50">
        <h2 className="font-semibold text-gov-blue">📋 공고 목록 <span className="text-sm text-gray-500 ml-2">총 {total}건 · 선택 {selected.size}건</span></h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gov-line">
              <th className="p-2 w-10">
                <input type="checkbox" checked={allSelected}
                       onChange={e => onToggleAll(e.target.checked)} />
              </th>
              <th className="text-left p-2">공고명</th>
              <th className="text-left p-2 w-32">기관</th>
              <th className="text-left p-2 w-20">마감</th>
              <th className="text-left p-2 w-20">지역</th>
              <th className="text-left p-2 w-24">업종</th>
              <th className="text-left p-2 w-16">분야</th>
            </tr>
          </thead>
          <tbody>
            {programs.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-gray-500">검색 결과가 없습니다. 좌측 검색을 시도하거나 키워드를 비워두세요.</td></tr>
            )}
            {programs.map(p => (
              <tr key={p.id} className={`border-b border-gov-line hover:bg-blue-50/30 ${selected.has(p.id) ? "bg-blue-50" : ""}`}>
                <td className="p-2 text-center">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => onToggle(p.id)} />
                </td>
                <td className="p-2">
                  {p.url ? <a href={p.url} target="_blank" rel="noopener" className="text-gov-accent hover:underline">{p.title}</a> : p.title}
                  {p.summary && <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{p.summary}</div>}
                </td>
                <td className="p-2 text-xs">{p.agency ?? "-"}</td>
                <td className="p-2 text-xs">{formatDeadline(p.deadline)}</td>
                <td className="p-2 text-xs">{p.region ?? "-"}</td>
                <td className="p-2 text-xs">{p.industry ?? "-"}</td>
                <td className="p-2 text-xs">{p.field ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDeadline(d: string | null): string {
  if (!d) return "상시";
  // YYYYMMDD → YYYY-MM-DD 정규화 (DB 에 옛날 포맷 남아있을 수 있음)
  let iso = d;
  if (/^\d{8}$/.test(d)) {
    iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return d;             // 파싱 실패 시 원문
  const days = Math.ceil((t - Date.now()) / 86_400_000);
  if (days < 0) return "마감";
  if (days === 0) return "D-DAY";
  return `D-${days}`;
}
