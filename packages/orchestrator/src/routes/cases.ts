import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createOrGetCase, getCase, listCases } from "../board/cases.js";
import { listPostsByCase } from "../board/posts.js";
import { getRunsByCase } from "../board/runs.js";
import { getProgram } from "../board/programs.js";
import { getProfile, getOrCreateDemoProfile } from "../board/profiles.js";
import { runOne, runBulk } from "../agents/orchestrator.js";
import { AgentIdEnum } from "@gov/shared";

const router = new Hono();

const CreateCaseSchema = z.object({
  programId: z.string(),
  companyProfileId: z.string().optional(),
});

router.post("/", zValidator("json", CreateCaseSchema), async (c) => {
  const { programId, companyProfileId } = c.req.valid("json");
  const profileId = companyProfileId ?? getOrCreateDemoProfile().id;
  const program = getProgram(programId);
  if (!program) return c.json({ error: "공고 없음" }, 404);
  const kase = createOrGetCase(profileId, programId);
  return c.json({ case: kase, program });
});

router.get("/", (c) => c.json({ cases: listCases() }));

router.get("/:id", (c) => {
  const id = c.req.param("id");
  const kase = getCase(id);
  if (!kase) return c.json({ error: "케이스 없음" }, 404);
  const program = getProgram(kase.programId);
  const profile = getProfile(kase.companyProfileId);
  const posts = listPostsByCase(id);
  const runs = getRunsByCase(id);
  return c.json({ case: kase, program, profile, posts, runs });
});

// 단일 케이스 — 4개 에이전트 fan-out
router.post("/:id/run-all", async (c) => {
  const id = c.req.param("id");
  const kase = getCase(id);
  if (!kase) return c.json({ error: "케이스 없음" }, 404);
  const result = runBulk({
    companyProfileId: kase.companyProfileId,
    programIds: [kase.programId],
  });
  return c.json({ ok: true, ...result });
});

// 단일 케이스 × 단일 에이전트 (재실행)
router.post("/:id/agents/:agentId/run", async (c) => {
  const id = c.req.param("id");
  const agentId = AgentIdEnum.parse(c.req.param("agentId"));
  const kase = getCase(id);
  if (!kase) return c.json({ error: "케이스 없음" }, 404);
  // background fire-and-forget
  void runOne({
    companyProfileId: kase.companyProfileId,
    programId: kase.programId,
    agentId,
  });
  return c.json({ ok: true, caseId: id, agentId });
});

export default router;
