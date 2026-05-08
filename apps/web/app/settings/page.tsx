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
  const [maxPerSource, setMaxPerSource] = useState(100);
  const [wipe, setWipe] = useState(true);
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
    try {
      const res = await fetch("/api/admin/seed-real", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPerSource, wipe }),
      }).then(r => r.json());
      if (res.ok) {
        setMessage({
          kind: "ok",
          text: `✅ 실데이터 ${res.count}건 적재 (소스: ${res.sources.join(", ")}, 현재 DB 총 ${res.countTotalAfter}건${res.wipe ? ", 기존 삭제" : ", 누적"})`,
        });
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
