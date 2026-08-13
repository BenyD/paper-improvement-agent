"use client";

/**
 * Last-resort boundary: replaces the root layout, so it must render its own
 * html/body and cannot rely on app CSS being alive.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 600 }}>
          Something went wrong
        </h1>
        <p style={{ color: "#666", maxWidth: "28rem", fontSize: "14px" }}>
          {error.message || "The application failed to render."}
          {error.digest ? ` (digest: ${error.digest})` : ""}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: "1px solid #ccc",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "14px",
            cursor: "pointer",
            background: "#111",
            color: "#fff",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
