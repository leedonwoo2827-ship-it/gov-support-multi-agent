import { Hono } from "hono";
import { getProgram, listAllPrograms } from "../board/programs.js";

const router = new Hono();

router.get("/", (c) => c.json({ programs: listAllPrograms() }));

router.get("/:id", (c) => {
  const p = getProgram(c.req.param("id"));
  if (!p) return c.json({ error: "공고 없음" }, 404);
  return c.json({ program: p });
});

export default router;
