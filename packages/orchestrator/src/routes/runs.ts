import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { DepartmentEnum } from "@gov/shared";
import { runBulk } from "../agents/orchestrator.js";
import { getBulkRun } from "../board/runs.js";

const router = new Hono();

const BulkSchema = z.object({
  programIds: z.array(z.string()).min(1).max(20),
  companyProfileId: z.string().optional(),
  department: DepartmentEnum.optional(),
});

router.post("/bulk", zValidator("json", BulkSchema), async (c) => {
  const { programIds, companyProfileId, department } = c.req.valid("json");
  const dept = department ?? "planning";
  // 프로파일 결정 (없으면 부서별 데모)
  const profileId = companyProfileId
    ?? (await import("../board/profiles.js")).getOrCreateDemoProfile(dept).id;
  const result = await runBulk({ companyProfileId: profileId, programIds, department: dept });
  return c.json({ ...result, totalAgents: programIds.length * 4 });
});

router.get("/:id", (c) => {
  const r = getBulkRun(c.req.param("id"));
  if (!r) return c.json({ error: "실행 없음" }, 404);
  return c.json(r);
});

export default router;
