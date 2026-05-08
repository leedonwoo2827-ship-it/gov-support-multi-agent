"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface SettingMeta {
  key: string;
  label: string;
  description: string;
  example: string;
  source: string;
}

interface SettingStatus {
  key: string;
  isSet: boolean;
  preview: string | null;
  source: "db" | "env" | "none";
}

export default function SettingsPage() {
  const [meta, setMeta] = useState<SettingMeta[]>([]);
  const [status, setStatus] = useState<SettingStatus[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [maxPerSource, setMaxPerSource] = useState(100);
  const [wipe, setWipe] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  async function loadHistory() {
    const res = await fetch("/api/admin/history?limit=20").then(r => r.json());
    setHistory(res.history ?? []);
  }

  async function loadStatus() {
    const res = await fetch("/api/settings").then(r => r.json());
    setMeta(res.meta);
    setStatus(res.status);
  }

  useEffect(() => { loadStatus(); loadHistory(); }, []);

  async function save(key: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: draft[key] ?? "" }),
      }).then(r => r.json());
      if (res.ok) {
        setMessage({ kind: "ok", text: `${key} ${res.action === "saved" ? "저장됨" : "삭제됨"}` });
        setDraft(d => ({ ...d, [key]: "" }));
        await loadStatus();
      } else {
        setMessage({ kind: "err", text: res.error ?? "저장 실패" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function clearKey(key: string) {
    if (!confirm(`${key} 키를 삭제할까요?`)) return;
    setBusy(true);
    await fetch(`/api/settings/${key}`, { method: "DELETE" });
    await loadStatus();
    setBusy(false);
  }

  async function seedReal() {
    setBusy(true);
    setMessage(null);
    setDiagnostics(null);
    try {
      const res = await fetch("/api/admin/seed-real", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPerSource, wipe }),
      }).then(r => r.json());
      setDiagnostics(res);
      if (res.ok) {
        if (res.count === 0) {
          setMessage({
            kind: "err",
            text: `⚠ API 호출은 성공했으나 0건 반환. 아래 진단 정보를 확인하세요.`,
          });
        } else {
          setMessage({
            kind: "ok",
            text: `✅ 실데이터 ${res.count}건 적재 (소스: ${res.sources.join(", ")}, 현재 DB 총 ${res.countTotalAfter}건${res.wipe ? ", 기존 삭제" : ", 누적"})`,
          });
        }
        await loadHistory();
      } else {
        setMessage({ kind: "err", text: `❌ ${res.error}` });
      }
    } catch (e) {
      setMessage({ kind: "err", text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function seedFixture() {
    if (!confirm("실데이터를 지우고 합성 fixture 20건으로 되돌릴까요?")) return;
    setBusy(true);
    const res = await fetch("/api/admin/seed-fixture", { method: "POST" }).then(r => r.json());
    setMessage({ kind: "ok", text: `✅ fixture ${res.count}건 적재됨 (현재 DB 총 ${res.countTotalAfter}건)` });
    await loadHistory();
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-gov-bg">
      <header className="bg-gov-blue text-white px-6 py-3 shadow">
        <div className="max-w-[1100px] mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold">⚙️ 설정 — API 키 관리</h1>
          <Link href="/" className="text-xs underline opacity-90 hover:opacity-100">← 대시보드로 돌아가기</Link>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto p-4 space-y-6">

        <section className="gov-card p-4">
          <h2 className="font-semibold text-gov-blue mb-2">📥 실데이터 적재</h2>
          <p className="text-sm text-gray-600 mb-3">
            아래에서 키 입력 후 정부 API 에서 공고를 가져와 게시판에 적재합니다.
            <br />
            <span className="text-xs">한 소스당 한 번에 최대 500건. data.go.kr 일일 트래픽 제한 10,000회 (충분).</span>
          </p>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <label className="text-sm flex items-center gap-2">
              소스당 받을 건수:
              <input
                type="number"
                min={10}
                max={500}
                step={10}
                value={maxPerSource}
                onChange={e => setMaxPerSource(Number(e.target.value))}
                className="border border-gov-line rounded px-2 py-1 w-20 text-sm"
              />
              건
            </label>
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={wipe} onChange={e => setWipe(e.target.checked)} />
              가져오기 전 기존 데이터 초기화 (공고+분석기록 모두 삭제)
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={seedReal} disabled={busy} className="gov-btn">
              {busy ? "⏳ 가져오는 중..." : `🔄 실데이터 가져오기 (정부 API)`}
            </button>
            <button onClick={seedFixture} disabled={busy} className="gov-btn-sub">
              ↩ 합성 fixture 20건으로 되돌리기
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            💡 키가 여러 개면 모든 소스를 동시에 가져옵니다. 키 없는 소스는 자동으로 건너뜀.
          </p>
        </section>

        {message && (
          <div className={`gov-card p-3 text-sm ${message.kind === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {message.text}
          </div>
        )}

        {diagnostics && (diagnostics.count === 0 || diagnostics.warnings?.length > 0) && (
          <div className="gov-card p-4 bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">🔍 진단 정보</h3>

            {diagnostics.sourceStats && (
              <div className="mb-3">
                <p className="text-sm font-medium text-blue-900 mb-1">소스별 호출 결과</p>
                <table className="w-full text-xs">
                  <thead className="bg-blue-100 border-b border-blue-200">
                    <tr>
                      <th className="text-left p-2">소스</th>
                      <th className="text-right p-2">받은 건수</th>
                      <th className="text-left p-2">에러 / 비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(diagnostics.sourceStats).map(([src, stat]: [string, any]) => (
                      <tr key={src} className="border-b border-blue-100">
                        <td className="p-2 font-medium">{src}</td>
                        <td className="p-2 text-right">{stat.fetched ?? 0}</td>
                        <td className="p-2 text-red-700">{stat.error ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {diagnostics.warnings?.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-medium text-blue-900 mb-1">경고</p>
                <ul className="text-xs text-blue-900 list-disc pl-5 space-y-1">
                  {diagnostics.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {diagnostics.count === 0 && (
              <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200 text-xs text-yellow-900">
                <p className="font-medium mb-1">⚠ 0건 반환 시 주로 다음 원인:</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li><strong>키 활성화 지연</strong>: data.go.kr 승인 후 최대 1시간 후에 활성화. 잠시 기다렸다가 다시 시도.</li>
                  <li><strong>Encoding/Decoding 키 혼동</strong>: data.go.kr 마이페이지에서 "일반 인증키 (<strong>Encoding</strong>)" 을 복사했는지 확인. Decoding 은 작동 안 함.</li>
                  <li><strong>인증키 누락 또는 오타</strong>: 64자 hex 문자열인지 다시 확인. 앞뒤 공백 제거.</li>
                  <li><strong>일일 트래픽 초과</strong>: data.go.kr 마이페이지 &gt; 트래픽 현황에서 잔량 확인.</li>
                  <li><strong>모집중 공고 없음</strong>: 모든 공고가 모집 마감 상태일 수 있음. 드물지만 가능.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        <section className="gov-card p-4">
          <h2 className="font-semibold text-gov-blue mb-3">API 키 입력</h2>
          <p className="text-sm text-gray-600 mb-4">
            키는 SQLite 의 <code>settings</code> 테이블에 평문 저장됩니다. 외부 노출 금지.
            환경변수로 설정해도 동작하며, DB 값이 우선합니다.
          </p>
          <div className="space-y-4">
            {meta.map(m => {
              const st = status.find(s => s.key === m.key);
              const visible = show[m.key];
              return (
                <div key={m.key} className="border-b border-gov-line pb-4 last:border-b-0">
                  <header className="flex items-center justify-between mb-1">
                    <h3 className="font-medium">{m.label}</h3>
                    <span className={`status-pill ${st?.isSet ? "status-completed" : "status-queued"}`}>
                      {st?.isSet ? `설정됨 (${st.source})` : "미설정"}
                    </span>
                  </header>
                  <p className="text-xs text-gray-600 mb-1">{m.description}</p>
                  <p className="text-xs text-gray-400 mb-2">
                    예: <code>{m.example}</code> ·{" "}
                    <a href={m.source} target="_blank" rel="noopener" className="text-gov-accent hover:underline">
                      발급 페이지 ↗
                    </a>
                  </p>
                  {st?.preview && (
                    <p className="text-xs text-gray-500 mb-2">
                      현재 값: <code className="bg-gray-100 px-1 rounded">{st.preview}</code>
                    </p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type={visible ? "text" : "password"}
                      placeholder={m.example}
                      value={draft[m.key] ?? ""}
                      onChange={e => setDraft(d => ({ ...d, [m.key]: e.target.value }))}
                      className="flex-1 border border-gov-line rounded px-2 py-1.5 text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShow(s => ({ ...s, [m.key]: !s[m.key] }))}
                      className="gov-btn-sub text-xs"
                    >
                      {visible ? "🙈 숨김" : "👁 표시"}
                    </button>
                    <button
                      type="button"
                      onClick={() => save(m.key)}
                      disabled={busy || !(draft[m.key]?.trim())}
                      className="gov-btn"
                    >
                      💾 저장
                    </button>
                    {st?.isSet && st.source === "db" && (
                      <button
                        type="button"
                        onClick={() => clearKey(m.key)}
                        disabled={busy}
                        className="gov-btn-sub text-xs text-red-600 border-red-300"
                      >
                        🗑 삭제
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="gov-card p-4">
          <h2 className="font-semibold text-gov-blue mb-3">📜 데이터 적재 이력</h2>
          <p className="text-sm text-gray-600 mb-3">
            언제, 어디서, 몇 건을 가져왔는지 기록입니다. 부서·날짜별 운영 점검용.
          </p>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">아직 적재 기록이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gov-line">
                  <tr>
                    <th className="text-left p-2">시각</th>
                    <th className="text-left p-2">유형</th>
                    <th className="text-left p-2">소스</th>
                    <th className="text-right p-2">소스당</th>
                    <th className="text-center p-2">덮어쓰기</th>
                    <th className="text-right p-2">받은 건수</th>
                    <th className="text-right p-2">DB 누적</th>
                    <th className="text-left p-2">경고</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="border-b border-gov-line hover:bg-blue-50/30">
                      <td className="p-2 font-mono">{h.ranAt}</td>
                      <td className="p-2">
                        <span className={`status-pill ${h.kind === "real" ? "status-completed" : "status-queued"}`}>
                          {h.kind === "real" ? "🔄 실데이터" : "📦 fixture"}
                        </span>
                      </td>
                      <td className="p-2">{h.sources.join(", ")}</td>
                      <td className="p-2 text-right">{h.maxPerSource ?? "-"}</td>
                      <td className="p-2 text-center">{h.wipe ? "☑" : "☐"}</td>
                      <td className="p-2 text-right font-medium">{h.countInserted.toLocaleString()}</td>
                      <td className="p-2 text-right">{h.countTotalAfter.toLocaleString()}</td>
                      <td className="p-2 text-yellow-700">
                        {h.warnings.length > 0 ? `⚠ ${h.warnings.length}건` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="gov-card p-4 bg-yellow-50 border-yellow-300">
          <h2 className="font-semibold text-yellow-900 mb-2">⚠ 보안 주의</h2>
          <ul className="text-sm text-yellow-900 space-y-1 list-disc pl-5">
            <li>API 키는 SQLite 에 평문 저장됩니다. <code>data/gov.db</code> 파일을 외부에 공유하지 마세요.</li>
            <li>여러 사람이 같은 PC 를 쓴다면, 각자 별도 인증키를 발급받아 사용하세요.</li>
            <li>키가 유출됐다고 의심되면 발급처(data.go.kr 등)에서 즉시 재발급/폐기.</li>
            <li>운영 환경에서는 환경변수 + 시크릿 매니저 사용 권장.</li>
          </ul>
        </section>

      </main>
    </div>
  );
}
