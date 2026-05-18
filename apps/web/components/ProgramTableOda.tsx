"use client";
import { useMemo, useState } from "react";
import type { Program } from "@gov/shared";

interface KoicaMeta {
  status?: string | null;       // BID_PROGRS_STTUS_NM (접수중/낙찰/유찰...)
  cntrct?: string | null;       // CNTRCT_MTH_NM (일반경쟁/제한경쟁...)
  scsbid?: string | null;       // SCSBID_MTH_NM (낙찰자선정방식)
  limit?: number | string | null; // BID_LMT_AMOUNT
  bsnsSe?: string | null;       // PRCURE_BSNS_SE_CD_NM (조달사업구분)
  detailSe?: string | null;     // PRCURE_DETAIL_SE_NM (조달상세구분)
  pblancNo?: string | null;     // PBLANC_NO
  pblancOdr?: string | number | null;
}

function parseKoicaMeta(summary: string | null): KoicaMeta {
  if (!summary) return {};
  try {
    return JSON.parse(summary) as KoicaMeta;
  } catch {
    return {};
  }
}

function formatAmount(v: number | string | null | undefined): string {
  if (v == null || v === "") return "-";
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (Number.isNaN(n) || n === 0) return "-";
  return `₩${n.toLocaleString("ko-KR")}`;
}

// 리스트에서 숨길 "최종" 상태 — 전략에는 DB 통해 여전히 접근 가능.
// "마감"은 제출 마감일이 지나도 평가가 진행 중일 수 있어 제외하지 않음.
const CLOSED_PATTERNS = ["낙찰", "유찰", "체결", "종료", "취소"];
function isClosed(status: string | null | undefined): boolean {
  if (!status) return false;
  return CLOSED_PATTERNS.some((p) => status.includes(p));
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-gray-400 text-xs">-</span>;
  const closed = isClosed(status);
  const cls = closed ? "bg-gray-200 text-gray-600" : "bg-emerald-100 text-emerald-800";
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{status}</span>;
}

interface Props {
  programs: Program[];
  total: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (select: boolean) => void;
}

export default function ProgramTableOda({ programs, selected, onToggle, onToggleAll }: Props) {
  const [showClosed, setShowClosed] = useState(false);

  const filtered = useMemo(() => {
    if (showClosed) return programs;
    return programs.filter((p) => {
      const meta = parseKoicaMeta(p.summary);
      return !isClosed(meta.status);
    });
  }, [programs, showClosed]);

  const allSelected = useMemo(
    () => filtered.length > 0 && filtered.every((p) => selected.has(p.id)),
    [filtered, selected],
  );
  const hiddenCount = programs.length - filtered.length;

  return (
    <div className="gov-card overflow-hidden">
      <header className="px-4 py-2 border-b border-gov-line flex items-center justify-between bg-gray-50 gap-2">
        <h2 className="font-semibold text-gov-blue">
          🌏 KOICA 입찰공고
          <span className="text-sm text-gray-500 ml-2">
            {showClosed ? "전체" : "진행중"} {filtered.length}건 · 선택 {selected.size}건
          </span>
          {!showClosed && hiddenCount > 0 && (
            <span className="text-xs text-gray-400 ml-2">(낙찰·체결 {hiddenCount}건 숨김)</span>
          )}
        </h2>
        {programs.length > 0 && (
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="text-xs text-gov-accent hover:underline whitespace-nowrap"
          >
            {showClosed ? "진행중만 보기" : `전체 보기 (${programs.length}건)`}
          </button>
        )}
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gov-line text-xs">
              <th className="p-2 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
              </th>
              <th className="text-left p-2">공고명</th>
              <th className="text-left p-2 w-32">공고번호</th>
              <th className="text-left p-2 w-20">진행상태</th>
              <th className="text-left p-2 w-28">조달구분</th>
              <th className="text-left p-2 w-24">계약방법</th>
              <th className="text-left p-2 w-24">낙찰자선정</th>
              <th className="text-right p-2 w-28">입찰한도</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500">
                  {programs.length === 0
                    ? "KOICA 공고가 없습니다. [설정] → 실데이터 가져오기를 실행하세요."
                    : `진행중인 KOICA 공고가 없습니다. 우측 [전체 보기]로 마감·낙찰 ${hiddenCount}건을 펼치면 전략 분석용으로 활용 가능합니다.`}
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const meta = parseKoicaMeta(p.summary);
              const fullPblancNo = meta.pblancNo
                ? `${meta.pblancNo}${meta.pblancOdr ? `-${meta.pblancOdr}` : ""}`
                : "-";
              return (
                <tr
                  key={p.id}
                  className={`border-b border-gov-line hover:bg-blue-50/30 ${selected.has(p.id) ? "bg-blue-50" : ""}`}
                >
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => onToggle(p.id)}
                    />
                  </td>
                  <td className="p-2">
                    {p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener"
                        className="text-gov-accent hover:underline"
                      >
                        {p.title}
                      </a>
                    ) : (
                      p.title
                    )}
                    {meta.detailSe && (
                      <div className="text-xs text-gray-500 mt-0.5">{meta.detailSe}</div>
                    )}
                  </td>
                  <td className="p-2 text-xs font-mono">{fullPblancNo}</td>
                  <td className="p-2">
                    <StatusBadge status={meta.status} />
                  </td>
                  <td className="p-2 text-xs">{meta.bsnsSe ?? p.field ?? "-"}</td>
                  <td className="p-2 text-xs">{meta.cntrct ?? "-"}</td>
                  <td className="p-2 text-xs">{meta.scsbid ?? "-"}</td>
                  <td className="p-2 text-xs text-right">{formatAmount(meta.limit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
