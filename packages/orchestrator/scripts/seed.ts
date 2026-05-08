// 시드 스크립트 — _docs/fixtures/programs.sample.json 을 SQLite 에 적재

import "dotenv/config";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, closeDb } from "../src/db/client.js";
import { bulkUpsertPrograms, countPrograms } from "../src/board/programs.js";
import { getOrCreateDemoProfile } from "../src/board/profiles.js";
import type { Program } from "@gov/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");

const dbPath = process.env.DB_PATH ?? "./data/gov.db";
mkdirSync(dirname(resolve(ROOT, dbPath)), { recursive: true });

const fixturePath = join(ROOT, "_docs", "fixtures", "programs.sample.json");
const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as any[];

const programs: Program[] = raw.map(r => ({
  id: `${r.source}:${r.programId}`,
  source: r.source,
  programId: r.programId,
  title: r.title,
  agency: r.agency ?? null,
  region: r.region ?? null,
  industry: r.industry ?? null,
  field: r.field ?? null,
  deadline: r.deadline ?? null,
  url: r.url ?? null,
  summary: r.summary ?? null,
  rawText: r.rawText ?? r.summary ?? r.title,
}));

getDb();
bulkUpsertPrograms(programs);
const profile = getOrCreateDemoProfile();

console.log(`✅ ${programs.length}개 공고 시드 완료. 총 DB: ${countPrograms()}개`);
console.log(`✅ 데모 프로파일: ${profile.profile.companyName} (id=${profile.id})`);
closeDb();
