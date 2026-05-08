// 검색 라우트 — SQLite 캐시 우선, 비어있거나 강제 새로고침 시 정부 API 호출

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SearchFiltersSchema } from "@gov/shared";
import { searchPrograms, bulkUpsertPrograms, countPrograms } from "../board/programs.js";
import { searchGovernmentSupport } from "@gov/mcp-tools";
import { getApiKeys } from "../board/settings.js";
import type { Program } from "@gov/shared";

const router = new Hono();

router.post("/", zValidator("json", SearchFiltersSchema), async (c) => {
  const filters = c.req.valid("json");
  const refresh = c.req.query("refresh") === "1";

  // 1) SQLite 우선
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
          sources: ["bizinfo", "kstartup"],
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
            deadline: a.deadline ?? null,
            url: a.detailUrl ?? null,
            summary: raw?.pblancNm || raw?.biz_pbanc_nm || null,
            rawText: [raw?.pblancCn, raw?.pbanc_ctnt, a.title, a.agency, a.field, a.region]
              .filter(Boolean).join("\n\n").slice(0, 5000) || a.title,
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
