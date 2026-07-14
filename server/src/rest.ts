import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { Pool } from "./db.js";
import * as repo from "./repo.js";

const stepSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
});

const groupSchema = z.object({
  id: z.string(),
  title: z.string(),
  steps: z.array(stepSchema),
});

const commentSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.number(),
});

const goalSchema = z.object({
  id: z.string(),
  title: z.string(),
  why: z.string().optional(),
  createdAt: z.number(),
  groups: z.array(groupSchema),
  comments: z.array(commentSchema).optional(),
});

const putBodySchema = z.object({
  goals: z.array(goalSchema),
  /**
   * The `updatedAt` the client last saw. Sent back so we can reject a write
   * built on a stale read (an MCP tool may have written since). Omit to force.
   */
  baseUpdatedAt: z.number().nullable().optional(),
});

/**
 * The REST surface the web app syncs against. Deliberately coarse: the app owns
 * the whole store client-side, so it pulls all of it and pushes all of it. The
 * fine-grained operations live on the MCP side, where an agent acts one edit at
 * a time.
 */
export function createRestRouter(pool: Pool): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "goals-app", version: 1 });
  });

  router.get("/goals", async (_req, res, next) => {
    try {
      res.json(await repo.getState(pool));
    } catch (err) {
      next(err);
    }
  });

  router.put("/goals", async (req, res, next) => {
    try {
      const parsed = putBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
        return;
      }
      const { goals, baseUpdatedAt } = parsed.data;
      res.json(await repo.replaceAll(pool, goals, baseUpdatedAt ?? null));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof repo.ConflictError) {
    res.status(409).json({ error: err.message, serverUpdatedAt: err.serverUpdatedAt });
    return;
  }
  if (err instanceof repo.NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: "Internal server error" });
}
