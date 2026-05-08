// 설정 저장소 — API 키 + 기타 설정. SQLite 단일 행.

import { getDb } from "../db/client.js";

export type SettingKey =
  | "ANTHROPIC_API_KEY"
  | "PUBLIC_DATA_SERVICE_KEY"
  | "BIZINFO_API_KEY"
  | "SMES24_API_KEY";

export const SETTING_KEYS: SettingKey[] = [
  "ANTHROPIC_API_KEY",
  "PUBLIC_DATA_SERVICE_KEY",
  "BIZINFO_API_KEY",
  "SMES24_API_KEY",
];

export interface SettingMeta {
  key: SettingKey;
  label: string;
  description: string;
  example: string;
  source: string;
}

export const SETTING_META: SettingMeta[] = [
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic API 키",
    description: "Claude API. 미설정 시 mock 모드 자동 진입.",
    example: "sk-ant-api03-XXXXXXXX-XXXX-XXXX...",
    source: "https://console.anthropic.com/",
  },
  {
    key: "PUBLIC_DATA_SERVICE_KEY",
    label: "공공데이터포털 인증키",
    description: "data.go.kr 일반 인증키 (Encoding). K-Startup, 중소기업 지원사업 등 공통.",
    example: "여기에 64자 hex 문자열 입력",
    source: "https://www.data.go.kr/iim/api/selectAcountList.do",
  },
  {
    key: "BIZINFO_API_KEY",
    label: "기업마당 인증키",
    description: "bizinfo.go.kr 자체 발급 키 (data.go.kr 와 별개).",
    example: "여기에 발급받은 짧은 키 입력",
    source: "https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C171/AS/74/list.do",
  },
  {
    key: "SMES24_API_KEY",
    label: "중소벤처24 인증키",
    description: "smes.go.kr 자체 발급 (선택).",
    example: "여기에 발급받은 키 입력",
    source: "https://www.smes.go.kr/",
  },
];

/**
 * 설정 값 조회. DB → 환경변수 fallback. 둘 다 없으면 undefined.
 */
export function getSetting(key: SettingKey): string | undefined {
  const r = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string } | undefined;
  if (r?.value?.trim()) return r.value.trim();
  return process.env[key]?.trim() || undefined;
}

export function setSetting(key: SettingKey, value: string): void {
  getDb().prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, value.trim());
}

export function deleteSetting(key: SettingKey): void {
  getDb().prepare(`DELETE FROM settings WHERE key = ?`).run(key);
}

export function listSettingsStatus(): { key: SettingKey; isSet: boolean; preview: string | null; source: "db" | "env" | "none" }[] {
  const db = getDb();
  return SETTING_KEYS.map(key => {
    const dbVal = (db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as any)?.value as string | undefined;
    const envVal = process.env[key]?.trim();
    const val = dbVal?.trim() || envVal || "";
    const source: "db" | "env" | "none" = dbVal?.trim() ? "db" : envVal ? "env" : "none";
    return {
      key,
      isSet: Boolean(val),
      preview: val ? maskKey(val) : null,
      source,
    };
  });
}

function maskKey(v: string): string {
  if (v.length <= 8) return "*".repeat(v.length);
  return v.slice(0, 4) + "*".repeat(Math.max(4, v.length - 8)) + v.slice(-4);
}

/**
 * toolBridge / search 에서 사용 — 모든 정부 API 키를 한 번에 가져오기.
 */
export function getApiKeys() {
  return {
    bizinfoApiKey: getSetting("BIZINFO_API_KEY"),
    smes24Token: getSetting("SMES24_API_KEY"),
    publicDataServiceKey: getSetting("PUBLIC_DATA_SERVICE_KEY"),
  };
}

export function getAnthropicKey(): string | undefined {
  return getSetting("ANTHROPIC_API_KEY");
}
