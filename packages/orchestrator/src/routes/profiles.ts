import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CompanyProfileSchema, DepartmentEnum, type Department } from "@gov/shared";
import { saveProfile, getProfile, listProfiles, getOrCreateDemoProfile } from "../board/profiles.js";

const router = new Hono();

function parseDept(raw: string | undefined): Department | undefined {
  if (!raw) return undefined;
  const parsed = DepartmentEnum.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

router.get("/", (c) => {
  const dept = parseDept(c.req.query("department"));
  return c.json({ profiles: listProfiles(dept) });
});

router.get("/demo", (c) => {
  const dept = parseDept(c.req.query("department")) ?? "planning";
  return c.json(getOrCreateDemoProfile(dept));
});

router.get("/:id", (c) => {
  const p = getProfile(c.req.param("id"));
  if (!p) return c.json({ error: "프로파일 없음" }, 404);
  return c.json({ profile: p });
});

router.post("/", zValidator("json", CompanyProfileSchema), (c) => {
  const id = saveProfile(c.req.valid("json"));
  return c.json({ id });
});

export default router;
