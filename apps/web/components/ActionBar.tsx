"use client";

interface Props {
  selectedCount: number;
  running: boolean;
  onAnalyze: () => void;
}

export default function ActionBar({ selectedCount, running, onAnalyze }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 my-3">
      <button
        className="gov-btn"
        disabled={selectedCount === 0 || running}
        onClick={onAnalyze}
      >
        {running ? "🔄 실행 중…" : `🚀 전략 분석 (선택 ${selectedCount}건 × 4 = ${selectedCount * 4} 글)`}
      </button>
      <a href="/api/export/db" className="gov-btn-sub" download>📦 DB 다운로드</a>
      <a href="/api/export/programs/csv" className="gov-btn-sub" download>📊 공고 CSV</a>
      <a href="/api/export/posts/csv" className="gov-btn-sub" download>📝 게시글 CSV</a>
    </div>
  );
}
