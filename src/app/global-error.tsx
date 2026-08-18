"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (typeof window !== "undefined") {
    void fetch("/api/v1/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "global-error",
        message: error.message,
        stack: error.stack ?? null,
      }),
    });
  }

  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-[#111827] text-white">
        <main className="max-w-md p-8 text-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ff4b4b]">Error tracking</p>
          <h1 className="mt-2 text-3xl font-black">Something broke</h1>
          <p className="mt-3 text-white/70">The LMS is still in place. This page reported the failure to the infra log.</p>
          <button type="button" className="mt-6 rounded-2xl bg-[#58cc02] px-5 py-3 font-black text-[#113b00]" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
