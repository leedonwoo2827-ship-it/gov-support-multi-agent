import { Hono } from "hono";
import { listPosts, getPost } from "../board/posts.js";
import { AgentIdEnum } from "@gov/shared";

const router = new Hono();

router.get("/", (c) => {
  const agentId = c.req.query("agentId");
  const limit = Number(c.req.query("limit") ?? 100);
  const filter: any = { limit };
  if (agentId) {
    const parsed = AgentIdEnum.safeParse(agentId);
    if (parsed.success) filter.agentId = parsed.data;
  }
  return c.json({ posts: listPosts(filter) });
});

router.get("/:id", (c) => {
  const post = getPost(c.req.param("id"));
  if (!post) return c.json({ error: "글 없음" }, 404);
  return c.json({ post });
});

export default router;
