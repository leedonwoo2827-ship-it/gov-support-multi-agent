import { ulid } from "../lib/ulid.js";
import { getDb } from "../db/client.js";
import type { CompanyProfile } from "@gov/shared";

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

export function listProfiles(): { id: string; profile: CompanyProfile; createdAt: string }[] {
  const rows = getDb().prepare(`SELECT * FROM company_profiles ORDER BY created_at DESC`).all() as any[];
  return rows.map(r => ({
    id: r.id,
    profile: JSON.parse(r.profile_json),
    createdAt: r.created_at,
  }));
}

// 시연용: 기본 프로파일 반환 (없으면 생성)
export function getOrCreateDemoProfile(): { id: string; profile: CompanyProfile } {
  const all = listProfiles();
  if (all.length > 0) return { id: all[0].id, profile: all[0].profile };

  const demo: CompanyProfile = {
    companyName: "(주)데모컴퍼니",
    bizRegNo: "123-45-67890",
    industry: "정보통신업",
    industryCode: "62",
    employeeCount: 12,
    annualRevenueKrw: 1_500_000_000,
    foundedYear: 2022,
    region: "서울 강남구",
    stage: "초기",
    keywords: ["AI", "SaaS", "B2B"],
    certifications: ["벤처기업확인서"],
    representativeAge: 35,
  };
  const id = saveProfile(demo);
  return { id, profile: demo };
}
