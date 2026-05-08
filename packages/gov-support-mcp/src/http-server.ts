#!/usr/bin/env node
/**
 * gov-support HTTP 어댑터 (Dify 연동용)
 *
 * 기존 MCP 서버(src/server.ts)의 14개 도구를 Express HTTP 엔드포인트로 노출한다.
 * Dify 의 Custom Tool(OpenAPI 3.0) 로 등록되어 챗플로우에서 호출된다.
 *
 * 주요 특징:
 *   - 도구 함수를 직접 import (MCP 트랜스포트 우회)
 *   - ubion 회사 프로필 자동 주입 미들웨어 (eligibility / draftBusinessPlan 등)
 *   - 단순 Bearer 토큰 인증 (ADAPTER_TOKEN 환경변수 미설정 시 인증 스킵 — 개발용)
 *   - Zod 검증 실패 → 400, 그 외 → 500
 */

import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

import { logger } from "./utils/logger.js";
import {
  getBizinfoApiKey,
  getPublicDataServiceKey,
  getSmes24ApiToken,
} from "./govSupport/env.js";

// 14개 도구 import
import {
  SearchGovSupportSchema,
  searchGovernmentSupport,
} from "./govSupport/tools/unifiedSearch.js";
import {
  CompareByRegionSchema,
  handleCompareByRegion,
} from "./govSupport/tools/compareByRegion.js";
import {
  CheckEligibilitySchema,
  handleCheckEligibility,
} from "./govSupport/tools/eligibility.js";
import {
  GenerateDocumentChecklistSchema,
  handleGenerateDocumentChecklist,
} from "./govSupport/tools/documentChecklist.js";
import {
  BuildApplicationTimelineSchema,
  handleBuildApplicationTimeline,
} from "./govSupport/tools/timeline.js";
import {
  ManageAlertProfileSchema,
  handleManageAlertProfile,
} from "./govSupport/tools/alertProfile.js";
import {
  ManageBenefitHistorySchema,
  handleManageBenefitHistory,
} from "./govSupport/tools/benefitHistory.js";
import {
  DraftBusinessPlanSchema,
  handleDraftBusinessPlan,
  DraftSettlementReportSchema,
  handleDraftSettlementReport,
} from "./govSupport/tools/draftTools.js";
import {
  EvaluateStartupSchema,
  handleEvaluateStartup,
} from "./govSupport/tools/evaluateStartup.js";
import {
  AssessQualitySchema,
  handleAssessQuality,
} from "./govSupport/tools/assessQuality.js";

// ─── 경로 ───────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const COMPANY_PROFILES_PATH = path.join(REPO_ROOT, "data", "companyProfiles.json");
const OPENAPI_YAML_PATH = path.resolve(REPO_ROOT, "..", "docs", "02_OpenAPI.yaml");

// ─── 인증 미들웨어 ──────────────────────────────────────────────────────────

const ADAPTER_TOKEN = process.env.ADAPTER_TOKEN;

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // 헬스체크 + OpenAPI 스키마는 무인증 통과 (공개 메타데이터, Dify 가져가기용)
  if (req.path === "/healthz" || req.path === "/openapi.yaml") return next();
  if (!ADAPTER_TOKEN) return next(); // 개발용: 토큰 미설정 시 검증 스킵

  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${ADAPTER_TOKEN}`) {
    res.status(401).json({ error: true, message: "Unauthorized" });
    return;
  }
  next();
}

// ─── ubion 프로필 자동 주입 미들웨어 ──────────────────────────────────────

let cachedUbionProfile: Record<string, unknown> | null = null;

async function loadUbionProfile(): Promise<Record<string, unknown> | null> {
  if (cachedUbionProfile) return cachedUbionProfile;
  try {
    const raw = await fs.readFile(COMPANY_PROFILES_PATH, "utf-8");
    const data = JSON.parse(raw) as { profiles?: Array<Record<string, unknown>> };
    const ubion = data.profiles?.find((p) => p.businessNumber === "ubion-default");
    if (ubion) {
      cachedUbionProfile = ubion;
      logger.info("ubion-default 프로필 캐시 로드 완료");
    }
    return cachedUbionProfile;
  } catch (err) {
    logger.error("ubion 프로필 로드 실패", err);
    return null;
  }
}

async function injectUbionProfile(req: Request, _res: Response, next: NextFunction) {
  const body = req.body ?? {};
  if (!body.companyProfile) {
    const ubion = await loadUbionProfile();
    if (ubion) {
      // checkEligibility 등이 받는 inline companyProfile 형태로 주입
      // (Zod 스키마가 strip 하므로 호환되지 않는 키는 자동 제거됨)
      req.body.companyProfile = {
        companyName: ubion.companyName,
        businessType: ubion.businessType,
        industry: ubion.industry,
        employeeCount: ubion.employeeCount,
        annualRevenue: ubion.annualRevenue,
        foundedDate: ubion.foundedDate,
        regionHeadOffice: ubion.regionHeadOffice,
        certifications: ubion.certifications,
        companySizeClass: ubion.companySizeClass,
        isSmes24Member: ubion.isSmes24Member,
      };
    }
  }
  next();
}

// ─── 헬퍼: API 키 안전 조회 ────────────────────────────────────────────────

function getKeysSafe() {
  const keys: {
    bizinfoApiKey?: string;
    publicDataServiceKey?: string;
    smes24Token?: string;
  } = {};
  try { keys.bizinfoApiKey = getBizinfoApiKey(); } catch { /* 키 없으면 건너뜀 */ }
  try { keys.publicDataServiceKey = getPublicDataServiceKey(); } catch { /* 건너뜀 */ }
  try { keys.smes24Token = getSmes24ApiToken(); } catch { /* 건너뜀 */ }
  return keys;
}

// ─── 헬퍼: Zod 검증 + 핸들러 호출 + 에러 매핑 ────────────────────────────

type ZodLike = z.ZodTypeAny;

function makeRoute<S extends ZodLike, R>(
  schema: S,
  handler: (input: z.infer<S>) => Promise<R>
) {
  return async (req: Request, res: Response) => {
    try {
      const input = schema.parse(req.body ?? {});
      const result = await handler(input);
      res.json(result);
    } catch (err: unknown) {
      handleError(err, res, req.path);
    }
  };
}

function makeRouteWithKeys<S extends ZodLike, R>(
  schema: S,
  handler: (
    input: z.infer<S>,
    deps: ReturnType<typeof getKeysSafe>
  ) => Promise<R>
) {
  return async (req: Request, res: Response) => {
    try {
      const input = schema.parse(req.body ?? {});
      const result = await handler(input, getKeysSafe());
      res.json(result);
    } catch (err: unknown) {
      handleError(err, res, req.path);
    }
  };
}

function handleError(err: unknown, res: Response, route: string) {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: true,
      message: "입력 검증 실패",
      issues: err.issues,
      route,
    });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`[${route}] 도구 호출 오류`, err);
  res.status(500).json({ error: true, message, route });
}

// ─── 앱 구성 ────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));
app.use(authMiddleware);

// 헬스 체크
app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    service: "gov-support-http-adapter",
    version: "1.0.0",
    keys: {
      bizinfo: Boolean(process.env.BIZINFO_API_KEY),
      publicData: Boolean(process.env.PUBLIC_DATA_SERVICE_KEY),
      smes24: Boolean(process.env.SMES24_API_KEY),
      adapterAuth: Boolean(ADAPTER_TOKEN),
    },
    uptime: process.uptime(),
  });
});

// OpenAPI 스펙 노출 (Dify Custom Tool 등록 시 직접 URL 입력 가능)
app.get("/openapi.yaml", async (_req, res) => {
  try {
    const content = await fs.readFile(OPENAPI_YAML_PATH, "utf-8");
    res.type("text/yaml").send(content);
  } catch {
    res.status(404).type("text/plain").send(
      `OpenAPI spec not yet generated. Expected at: ${OPENAPI_YAML_PATH}`
    );
  }
});

// ── 통합 탐색 (3개 정부 API 통합 검색 + dedup)
app.post(
  "/tools/searchGovernmentSupport",
  makeRouteWithKeys(SearchGovSupportSchema, searchGovernmentSupport)
);

// ── 지역별 비교
app.post(
  "/tools/compareByRegion",
  makeRouteWithKeys(CompareByRegionSchema, handleCompareByRegion)
);

// ── 자격 판정 (ubion 프로필 자동 주입)
app.post(
  "/tools/checkEligibility",
  injectUbionProfile,
  makeRoute(CheckEligibilitySchema, handleCheckEligibility)
);

// ── 서류 체크리스트
app.post(
  "/tools/generateDocumentChecklist",
  makeRoute(GenerateDocumentChecklistSchema, handleGenerateDocumentChecklist)
);

// ── 신청 일정 타임라인
app.post(
  "/tools/buildApplicationTimeline",
  makeRoute(BuildApplicationTimelineSchema, handleBuildApplicationTimeline)
);

// ── 알림 프로파일 관리
app.post(
  "/tools/manageAlertProfile",
  makeRoute(ManageAlertProfileSchema, handleManageAlertProfile)
);

// ── 수혜 이력 관리
app.post(
  "/tools/manageBenefitHistory",
  makeRoute(ManageBenefitHistorySchema, handleManageBenefitHistory)
);

// ── 사업계획서 초안 (ubion 프로필 자동 주입)
app.post(
  "/tools/draftBusinessPlan",
  injectUbionProfile,
  makeRoute(DraftBusinessPlanSchema, handleDraftBusinessPlan)
);

// ── 정산 보고서 초안
app.post(
  "/tools/draftSettlementReport",
  makeRoute(DraftSettlementReportSchema, handleDraftSettlementReport)
);

// ── 창업지원사업 심사 점수 예측 (ubion 프로필 자동 주입)
app.post(
  "/tools/evaluateStartupApplication",
  injectUbionProfile,
  makeRoute(EvaluateStartupSchema, handleEvaluateStartup)
);

// ── 사업계획서 품질 측정
app.post(
  "/tools/assessBusinessPlanQuality",
  makeRoute(AssessQualitySchema, handleAssessQuality)
);

// 알 수 없는 경로
app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: `경로를 찾을 수 없습니다: ${req.method} ${req.path}`,
    availableTools: [
      "searchGovernmentSupport",
      "compareByRegion",
      "checkEligibility",
      "generateDocumentChecklist",
      "buildApplicationTimeline",
      "manageAlertProfile",
      "manageBenefitHistory",
      "draftBusinessPlan",
      "draftSettlementReport",
      "evaluateStartupApplication",
      "assessBusinessPlanQuality",
    ],
  });
});

// ─── 부팅 ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.ADAPTER_PORT ?? "8765", 10);

app.listen(PORT, () => {
  logger.info(`gov-support HTTP 어댑터 시작 — http://localhost:${PORT}`);
  logger.info(`헬스 체크: http://localhost:${PORT}/healthz`);
  logger.info(
    `Dify(컨테이너) 연결 URL: http://host.docker.internal:${PORT} ` +
      `(인증: ${ADAPTER_TOKEN ? "Bearer " + ADAPTER_TOKEN.slice(0, 4) + "***" : "없음(개발모드)"})`
  );
});
