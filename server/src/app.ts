import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import express, { type Express } from "express";
import type { Pool } from "./db.js";
import { createMcpServer } from "./mcp.js";
import { createRestRouter, errorHandler } from "./rest.js";

export type AppOptions = {
  pool: Pool;
  /** Allowed browser origin(s) for the sync API. `*` in local development. */
  corsOrigin?: string;
};

export function createApp({ pool, corsOrigin = "*" }: AppOptions): Express {
  const app = express();

  app.use(
    cors({
      origin: corsOrigin === "*" ? true : corsOrigin.split(",").map((o) => o.trim()),
      // The MCP client reads the session id back off the response.
      exposedHeaders: ["mcp-session-id"],
    })
  );
  app.use(express.json({ limit: "5mb" }));

  app.use("/api", createRestRouter(pool));

  /**
   * MCP over Streamable HTTP, stateless: a fresh server and transport per
   * request. There is no per-connection state worth keeping — the goals live in
   * Postgres — and statelessness means a restart or a second replica can serve
   * the next request without a session handshake.
   */
  app.post("/mcp", async (req, res) => {
    const server = createMcpServer(pool);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request failed:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // In stateless mode there's no server-initiated stream to attach to and no
  // session to delete, so the other two verbs the spec allows are 405s.
  const methodNotAllowed = (_req: express.Request, res: express.Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed: this MCP server is stateless" },
      id: null,
    });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.use(errorHandler);

  return app;
}
