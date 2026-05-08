// 실데이터 시드 — K-Startup (data.go.kr) 공고 100건을 실 API 에서 가져와 DB 에 적재
// 사용 전 .env 에 PUBLIC_DATA_SERVICE_KEY 설정 필요

import "dotenv/config";
import { searchGovernmentSupport } from "@gov/mcp-tools";
import { getDb, closeDb } from "../src/db/client.js";
import { bulkUpsertPrograms } from "../src/board/programs.js";
import { getOrCreateDemoProfile } from "../src/board/profiles.js";
import type { Program } from "@gov/shared";

const key = process.env.PUBLIC_DATA_SERVICE_KEY?.trim();
if (!key) {
  console.error("");
  console.error("❌ PUBLIC_DATA_SERVICE_KEY 가 .env 에 설정되어 있지 않습니다.");
  console.error("");
  console.error("설정 방법:");
  console.error("  1) https://www.data.go.kr/iim/api/selectAcountList.do 접속");
  console.error("  2) 활용신청한 K-Startup API 클릭 → 인증키(Encoding) 복사");
  console.error("  3) 프로젝트 루트의 .env 파일에 다음 한 줄 추가:");
  console.error("       PUBLIC_DATA_SERVICE_KEY=복사한_긴_Encoding_키");
  console.error("  4) 다시 seed-real.bat 또는 ./seed-real.sh 실행");
  console.error("");
  process.exit(1);
}

console.log("🔄 K-Startup 실 API 호출 중... (data.go.kr)");

const result = await searchGovernmentSupport(
  {
    sources: ["kstartup"],
    onlyRecruiting: true,
    maxPerSource: 100,
  },
  {
    publicDataServiceKey: key,
  },
);

if (result.announcements.length === 0) {
  console.error("❌ API 응답이 비어있습니다.");
  console.error("경고:", result.warnings);
  console.error("소스 통계:", result.sourceStats);
  process.exit(1);
}

const programs: Program[] = result.announcements.map((a) => ({
  id: `${a.source}:${a.programId}`,
  source: a.source,
  programId: a.programId,
  title: a.title,
  agency: a.agency ?? null,
  region: a.region ?? null,
  industry: a.industry ?? null,
  field: a.field ?? null,
  deadline: a.deadline ?? null,
  url: a.url ?? null,
  summary: a.summary ?? null,
  rawText: a.rawText ?? a.summary ?? a.title,
}));

const db = getDb();

console.log(`📦 기존 공고 데이터 삭제 (fixture + 이전 캐시)`);
db.exec("DELETE FROM programs");

console.log(`💾 K-Startup 실데이터 ${programs.length}건 적재 중...`);
bulkUpsertPrograms(programs);

const profile = getOrCreateDemoProfile();

console.log("");
console.log(`✅ 완료!`);
console.log(`   - 공고: ${programs.length}건 (실 API 데이터)`);
console.log(`   - 회사 프로파일: ${profile.profile.companyName}`);
console.log("");
console.log("이제 dev.bat (또는 ./dev.sh) 실행 → http://localhost:3000 에서 검색하세요.");
console.log("공고명 클릭 시 진짜 K-Startup 페이지로 이동합니다.");
console.log("");

if (result.warnings.length > 0) {
  console.log("⚠ 경고:");
  result.warnings.forEach(w => console.log(`   - ${w}`));
}

closeDb();
