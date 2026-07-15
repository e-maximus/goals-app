import { z } from "zod";
import { getPool } from "@/server/pool";
import * as repo from "@/server/repo";
import { resolveWebUser } from "@/server/users";
import { logRequest } from "@/server/log";

const stepSchema = z.object({
  id: z.string(),
  text: z.string(),
  description: z.string().optional(),
  done: z.boolean(),
});

const groupSchema = z.object({
  id: z.string(),
  title: z.string(),
  steps: z.array(stepSchema),
});

const noteSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.number(),
  stepId: z.string().optional(),
});

const goalSchema = z.object({
  id: z.string(),
  title: z.string(),
  why: z.string().optional(),
  createdAt: z.number(),
  groups: z.array(groupSchema),
  notes: z.array(noteSchema).optional(),
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
 * The REST surface the web app reads and writes. Deliberately coarse: the app
 * owns the whole store client-side, so it pulls all of it and pushes all of it.
 * The fine-grained operations live on the MCP side, where an agent acts one
 * edit at a time.
 *
 * Both verbs are scoped to the current user, resolved from the session cookie.
 * A first-time visitor is created here and handed a cookie (see resolveWebUser),
 * so GET doubles as "sign me in".
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const pool = await getPool();
    const { user, setCookie } = await resolveWebUser(pool, request);
    userId = user.id;
    const res = json(await repo.getState(pool, user.id), setCookie);
    logRequest(request, res.status, startedAt, { userId });
    return res;
  } catch (err) {
    return toErrorResponse(err, request, startedAt, userId);
  }
}

export async function PUT(request: Request) {
  const startedAt = Date.now();
  let userId: string | undefined;
  try {
    const parsed = putBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      logRequest(request, 400, startedAt);
      return Response.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { goals, baseUpdatedAt } = parsed.data;
    const pool = await getPool();
    const { user, setCookie } = await resolveWebUser(pool, request);
    userId = user.id;
    const res = json(await repo.replaceAll(pool, user.id, goals, baseUpdatedAt ?? null), setCookie);
    logRequest(request, res.status, startedAt, { userId });
    return res;
  } catch (err) {
    return toErrorResponse(err, request, startedAt, userId);
  }
}

/** JSON response that also sets the session cookie when a new user was minted. */
function json(body: unknown, setCookie: string | null): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(JSON.stringify(body), { headers });
}

/** The repo's domain errors, mapped onto status codes. Anything else is a 500. */
function toErrorResponse(
  err: unknown,
  request: Request,
  startedAt: number,
  userId?: string
): Response {
  const res = errorResponse(err);
  logRequest(request, res.status, startedAt, {
    userId,
    ...(res.status >= 500 ? { error: err instanceof Error ? err.message : String(err) } : {}),
  });
  return res;
}

function errorResponse(err: unknown): Response {
  if (err instanceof repo.ConflictError) {
    return Response.json(
      { error: err.message, serverUpdatedAt: err.serverUpdatedAt },
      { status: 409 }
    );
  }
  if (err instanceof repo.NotFoundError) {
    return Response.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof repo.ValidationError) {
    return Response.json({ error: err.message }, { status: 400 });
  }
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
