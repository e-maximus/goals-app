"use client";

import { useEffect } from "react";

/**
 * The last-resort boundary: it catches errors thrown by the root layout itself,
 * which the ordinary error.tsx sits inside of and so can't handle. It replaces
 * the whole document — hence its own <html>/<body> — and, because the layout is
 * what failed, it deliberately renders no app chrome and imports no component
 * that might be the thing that broke. Plain markup and inline styles only.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Keep Going couldn&apos;t start.</h1>
        <p style={{ maxWidth: "28rem", color: "#666" }}>
          Something failed before the app could render. Your goals are safe on the server.
        </p>
        {/* A plain anchor on purpose: next/link needs the router this boundary
            exists precisely because it may not have. A full reload is the point. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" style={{ textDecoration: "underline" }}>
          Reload the app
        </a>
      </body>
    </html>
  );
}
