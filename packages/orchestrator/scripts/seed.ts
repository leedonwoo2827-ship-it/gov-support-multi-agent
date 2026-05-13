// 시드 스크립트 — 부서별 회사 프로파일만 생성
// fixture 공고는 더 이상 시드하지 않음 (실데이터 중심 운영)

import "dotenv/config";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, closeDb } from "../src/db/client.js";
import { countPrograms } from "../src/board/programs.js";
import { seedAllDemoProfiles } from "../src/board/profiles.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");

const dbPath = process.env.DB_PATH ?? "./data/gov.db";
mkdirSync(dirname(resolve(ROOT, dbPath)), { recursive: true });

getDb();

const profiles = seedAllDemoProfiles();

console.log(`✅ 부서별 회사 프로파일 ${profiles.length}개 시드 완료:`);
profiles.forEach(p => console.log(`   - ${p.department}: ${p.id}`));
console.log(`\n📌 공고는 실데이터만 사용. 설정 페이지 [📥 실데이터 가져오기]로 적재.`);
console.log(`   현재 programs 누적: ${countPrograms()}건`);

closeDb();
