"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "2rem",
            fontFamily: "Arial, sans-serif",
            background: "#f2f4ed",
            color: "#18231d",
          }}
        >
          <section style={{ maxWidth: "32rem", textAlign: "center" }}>
            <p style={{ color: "#277a5c", fontWeight: 700, letterSpacing: ".08em" }}>NIHONGOBRIDGE</p>
            <h1>Something unexpected happened.</h1>
            <p>Our team has been notified. You can safely try again.</p>
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: "0.75rem",
                padding: "0.8rem 1.1rem",
                background: "#277a5c",
                color: "white",
                fontWeight: 700,
              }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
