"use client";

/** Last-resort screen when even the root layout fails. Plain HTML: no providers are available here. */
export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", background: "#f7f7f8", color: "#18181b" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#71717a" }}>Please reload the page.</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: "10px 16px", borderRadius: 8, border: 0, background: "#4f46e5", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
