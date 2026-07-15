/**
 * A cheap "is this us?" probe. The web app pings it before trusting an address,
 * and Railway can use it as a health check.
 */
export async function GET() {
  return Response.json({ ok: true, service: "goals-app", version: 1 });
}
