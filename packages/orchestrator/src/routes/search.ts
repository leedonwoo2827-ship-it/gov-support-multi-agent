// 검색 라우트 — SQLite 캐시 우선, 비어있거나 강제 새로고침 시 정부 API 호출
// 부서 기반 sources 분기: planning=기존 14개 API, edu=g2b-edu, oda=koica(+추후 EDCF/KOTRA/g2b-oda)

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SearchFiltersSchema, type Department } from "@gov/shared";
import { searchPrograms, bulkUpsertPrograms, countPrograms } from "../board/programs.js";
import { searchGovernmentSupport } from "@gov/mcp-tools";
import { getApiKeys } from "../board/settings.js";
import type { Program } from "@gov/shared";

function normalizeDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const s = String(d).trim();
  if (!s) return null;
  if (/^\d{12,14}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}[-/.]\d{2}[-/.]\d{2}/.test(s)) return s.slice(0, 10).replace(/[/.]/g, "-");
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

// 부서별 sources 매핑 — Phase 1.
// 추후 EDCF/KOTRA/g2b-oda 가 구현되면 oda 분기에 추가.
function sourcesForDepartment(dept: Department | undefined): Array<"bizinfo" | "kstartup" | "smes24" | "g2b-edu" | "g2b-oda" | "koica" | "edcf" | "kotra"> {
  if (dept === "edu") return ["g2b-edu"];
  if (dept === "oda") return ["koica"]; // Phase 2 에서 ["koica", "g2b-oda", "edcf", "kotra"] 로 확장
  return ["bizinfo", "kstartup"]; // planning (또는 undefined): 기존
}

// 신규 source 가 어떤 부서 소속인지 매핑 — bulkUpsert 시 department 자동 채움 보조
function inferDepartmentFromSource(source: string): Department {
  if (source === "g2b-edu") return "edu";
  if (source === "koica" || source === "g2b-oda" || source === "edcf" || source === "kotra") return "oda";
  return "planning";
}

const router = new Hono();

router.post("/", zValidator("json", SearchFiltersSchema), async (c) => {
  const filters = c.req.valid("json");
  const refresh = c.req.query("refresh") === "1";
  const sourcesForApi = sourcesForDepartment(filters.department);

  // 1) SQLite 우선 (부서 필터 자동 적용)
  let result = searchPrograms(filters);

  // 2) 결과 0 이거나 refresh 요청 시 정부 API 호출 시도
  const apiKeys = getApiKeys();
  if ((result.total === 0 || refresh) && (apiKeys.publicDataServiceKey || apiKeys.bizinfoApiKey || apiKeys.smes24Token)) {
    try {
      const apiResult = await searchGovernmentSupport(
        {
          keyword: filters.keyword,
          field: filters.field,
          region: filters.region,
          sources: sourcesForApi,
          onlyRecruiting: true,
          maxPerSource: 50,
        },
        apiKeys,
      );
      const programs: Program[] = apiResult.announcements
        .filter(a => a.source && a.announcementId && a.title)
        .map((a) => {
          const prefix = `${a.source}:`;
          const programId = a.announcementId.startsWith(prefix)
            ? a.announcementId.slice(prefix.length)
            : a.announcementId;
          const raw = a.rawItem as Record<string, any>;
          return {
            id: a.announcementId,
            source: a.source,
            programId,
            title: a.title,
            agency: a.agency ?? null,
            region: a.region ?? null,
            industry: null,
            field: a.field ?? null,
            deadline: normalizeDate(a.deadline),
            url: a.detailUrl ?? null,
            summary: raw?.pblancNm || raw?.biz_pbanc_nm || raw?.bidNtceNm || raw?.bsnsNm || null,
            rawText: [raw?.pblancCn, raw?.pbanc_ctnt, raw?.bidNtceNm, raw?.bsnsNm, a.title, a.agency, a.field, a.region]
              .filter(Boolean).join("\n\n").slice(0, 5000) || a.title,
            department: a.department ?? inferDepartmentFromSource(a.source),
          };
        });
      bulkUpsertPrograms(programs);
      result = searchPrograms(filters);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // API 실패해도 캐시 결과만 리턴
      return c.json({
        total: result.total,
        programs: result.programs,
        page: filters.page,
        pageSize: filters.pageSize,
        warnings: [`정부 API 호출 실패: ${msg}. 캐시된 결과만 표시.`],
      });
    }
  }

  return c.json({
    total: result.total,
    programs: result.programs,
    page: filters.page,
    pageSize: filters.pageSize,
    warnings: countPrograms() === 0 ? ["DB가 비어있습니다. pnpm seed 로 fixture 를 적재하거나 .env 에 API 키를 설정하세요."] : [],
  });
});

export default router;
