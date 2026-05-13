import { ulid } from "../lib/ulid.js";
import { getDb } from "../db/client.js";
import type { CompanyProfile, Department } from "@gov/shared";

export function saveProfile(profile: CompanyProfile): string {
  const db = getDb();
  const id = ulid();
  db.prepare(`INSERT INTO company_profiles (id, profile_json) VALUES (?, ?)`)
    .run(id, JSON.stringify(profile));
  return id;
}

export function getProfile(id: string): CompanyProfile | null {
  const r = getDb().prepare(`SELECT * FROM company_profiles WHERE id = ?`).get(id) as any;
  return r ? JSON.parse(r.profile_json) : null;
}

export function listProfiles(department?: Department): { id: string; profile: CompanyProfile; createdAt: string }[] {
  const rows = getDb().prepare(`SELECT * FROM company_profiles ORDER BY created_at DESC`).all() as any[];
  const all = rows.map(r => ({
    id: r.id,
    profile: JSON.parse(r.profile_json) as CompanyProfile,
    createdAt: r.created_at,
  }));
  return department ? all.filter(x => x.profile.department === department) : all;
}

// 부서별 디폴트 시드 프로파일 — 유비온 3개 부서
const DEMO_PROFILES: Record<Department, CompanyProfile> = {
  planning: {
    companyName: "유비온 — 경영기획팀",
    bizRegNo: "123-45-67890",
    industry: "교육 서비스업",
    industryCode: "85",
    employeeCount: 78,
    annualRevenueKrw: 18_500_000_000,
    foundedYear: 2008,
    region: "서울 강남구",
    stage: "중기",
    keywords: ["에듀테크", "LMS", "LXP", "AI", "DX 교육"],
    certifications: ["벤처기업확인서", "이노비즈", "교육서비스품질인증"],
    representativeAge: 48,
    department: "planning",
    pastPerformance: [
      { year: 2024, clientType: "정부", title: "K-디지털 교육사업 위탁운영", valueKrw: 1_200_000_000 },
      { year: 2023, clientType: "정부", title: "디지털 새싹 사업 (초중고)", valueKrw: 800_000_000 },
    ],
    contentIp: ["코스모스 LXP", "DEEPCO"],
    instructorPool: { count: 35, specialties: ["AI", "금융", "DX"] },
    languages: [],
    consortiumPartners: [],
    rdInvestmentKrw: 950_000_000,
    patentsCount: 7,
  },
  edu: {
    companyName: "유비온 — 교육사업부",
    bizRegNo: "123-45-67890",
    industry: "교육 서비스업 (위탁교육)",
    industryCode: "85",
    employeeCount: 42,
    annualRevenueKrw: 9_800_000_000,
    foundedYear: 2008,
    region: "서울 강남구",
    stage: "중기",
    keywords: ["금융 교육", "AI 교육", "직무역량", "이러닝", "리스킬링"],
    certifications: ["교육서비스품질인증", "ISO 9001"],
    department: "edu",
    pastPerformance: [
      { year: 2024, clientType: "금융권", title: "은행 임직원 AI 활용 교육 (450명)", valueKrw: 380_000_000 },
      { year: 2024, clientType: "금융권", title: "금융투자교육원 디지털 자산 과정", valueKrw: 220_000_000 },
      { year: 2023, clientType: "공공", title: "한국금융연수원 이러닝 콘텐츠 개발", valueKrw: 180_000_000 },
      { year: 2023, clientType: "기업", title: "대기업 사내 DX 리스킬링 (1,200명)", valueKrw: 540_000_000 },
    ],
    contentIp: ["코스모스 LXP", "금융 AI 표준안", "DX 직무역량 진단툴"],
    instructorPool: { count: 35, specialties: ["AI", "금융", "DX", "데이터분석", "RPA"] },
    languages: ["한국어", "영어"],
    consortiumPartners: [],
  },
  oda: {
    companyName: "유비온 — 해외사업부 (ODA)",
    bizRegNo: "123-45-67890",
    industry: "교육 서비스업 (국제개발)",
    industryCode: "85",
    employeeCount: 14,
    annualRevenueKrw: 4_200_000_000,
    foundedYear: 2008,
    region: "서울 강남구 (현지: 베트남 호치민, 캄보디아 프놈펜)",
    stage: "도약",
    keywords: ["ODA", "KOICA", "국제개발", "다국어 교육", "역량강화"],
    certifications: ["교육서비스품질인증"],
    department: "oda",
    pastPerformance: [
      { year: 2023, clientType: "KOICA", title: "베트남 ICT 교육 마스터플랜 수립", valueKrw: 850_000_000 },
      { year: 2022, clientType: "KOICA", title: "캄보디아 직업훈련센터 이러닝 구축", valueKrw: 1_100_000_000 },
      { year: 2021, clientType: "ODA(EDCF)", title: "라오스 교육행정 정보화 컨설팅", valueKrw: 620_000_000 },
    ],
    contentIp: ["코스모스 LXP (다국어 모드)"],
    instructorPool: { count: 8, specialties: ["ICT 교육", "개발협력", "현장 역량강화"] },
    languages: ["한국어", "영어", "베트남어", "크메르어"],
    consortiumPartners: ["베트남 ICT 협회", "캄보디아 노동부 산하 직업훈련센터협회", "현지 컨설팅사 KH-Edu"],
  },
};

// 시연용: 부서별 기본 프로파일 반환 (없으면 생성)
export function getOrCreateDemoProfile(department: Department = "planning"): { id: string; profile: CompanyProfile } {
  const existing = listProfiles(department);
  if (existing.length > 0) return { id: existing[0].id, profile: existing[0].profile };

  const demo = DEMO_PROFILES[department];
  const id = saveProfile(demo);
  return { id, profile: demo };
}

// 시드 스크립트용: 3개 부서 프로파일 모두 생성
export function seedAllDemoProfiles(): { department: Department; id: string }[] {
  const result: { department: Department; id: string }[] = [];
  for (const dept of ["planning", "edu", "oda"] as Department[]) {
    const r = getOrCreateDemoProfile(dept);
    result.push({ department: dept, id: r.id });
  }
  return result;
}
