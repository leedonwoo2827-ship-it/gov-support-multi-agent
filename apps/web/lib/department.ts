import type { Department } from "@gov/shared";

export const DEPARTMENTS: Department[] = ["planning", "edu", "oda"];

export interface DepartmentLabel {
  ko: string;
  emoji: string;
  short: string;             // 헤더용 (예: "유비온 — 교육사업부")
  description: string;       // 탭 부제
  placeholderKeyword: string;
}

export const DEPARTMENT_LABELS: Record<Department, DepartmentLabel> = {
  planning: {
    ko: "경영기획팀",
    emoji: "📊",
    short: "유비온 — 경영기획팀",
    description: "R&D · 창업 · 중소기업 지원금 신청",
    placeholderKeyword: "예: 스마트팩토리, AI 바우처, 창업",
  },
  edu: {
    ko: "교육사업부",
    emoji: "📚",
    short: "유비온 — 교육사업부",
    description: "나라장터 교육·훈련용역 입찰",
    placeholderKeyword: "예: 금융 AI, 직무역량, 이러닝",
  },
  oda: {
    ko: "해외사업부",
    emoji: "🌏",
    short: "유비온 — 해외사업부 (ODA)",
    description: "KOICA · EDCF · 국제개발 입찰",
    placeholderKeyword: "예: 베트남, 역량강화, ICT 교육",
  },
};

export function isDepartment(s: string | null | undefined): s is Department {
  return s === "planning" || s === "edu" || s === "oda";
}
