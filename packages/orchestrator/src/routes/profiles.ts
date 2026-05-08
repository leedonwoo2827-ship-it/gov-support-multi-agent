import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CompanyProfileSchema } from "@gov/shared";
import { saveProfile, getProfile, listProfiles, getOrCreateDemoProfile } from "../board/profiles.js";

const router = new Hono();

router.get("/", (c) => c.json({ profiles: listProfiles() }));

router.get("/demo", (c) => c.json(getOrCreateDemoProfile()));

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
