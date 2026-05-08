// 설정 라우트 — API 키 입력/조회

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  setSetting, deleteSetting, listSettingsStatus, SETTING_META, SETTING_KEYS,
  type SettingKey,
} from "../board/settings.js";

const router = new Hono();

router.get("/", (c) => {
  return c.json({
    meta: SETTING_META,
    status: listSettingsStatus(),
  });
});

const SaveSchema = z.object({
  key: z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]),
  value: z.string(),
});

router.post("/", zValidator("json", SaveSchema), (c) => {
  const { key, value } = c.req.valid("json");
  if (value.trim() === "") {
    deleteSetting(key);
    return c.json({ ok: true, action: "deleted", key });
  }
  setSetting(key, value);
  return c.json({ ok: true, action: "saved", key });
});

router.delete("/:key", (c) => {
  const key = c.req.param("key") as SettingKey;
  if (!SETTING_KEYS.includes(key)) return c.json({ error: "unknown key" }, 400);
  deleteSetting(key);
  return c.json({ ok: true });
});

export default router;
